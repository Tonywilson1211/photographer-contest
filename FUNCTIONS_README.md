# Monthly Contest Automation Cloud Function

This Firebase Cloud Function automates the monthly lifecycle of your photography contest by running on the 1st of every month at 00:01 UTC.

## 🎯 What It Does

The `monthlyContestTrigger` function performs a 3-step automation process:

1. **Archive Previous Month**: 
   - Finds contests in "voting" status from the previous month
   - Calculates Gold/Silver/Bronze winners based on vote counts
   - Moves contest data to the `archives` collection
   - Updates contest status to "archived"

2. **Activate Current Month**:
   - Finds contests in "submissions_open" status from the current month
   - Changes status to "voting"
   - Adds voting timestamp

3. **Prepare Next Month**:
   - Creates a new contest document for the upcoming month
   - Sets status to "submissions_open"
   - Prepares for photo submissions

## 🏗️ Firestore Structure

### Collections:
- `contests`: Active and upcoming contests
- `contests/{contestId}/votes`: Vote subcollection for each contest
- `archives`: Archived completed contests

### Contest Document Structure:
```json
{
  "monthName": "January 2026",
  "monthKey": "2026-01",
  "year": 2026,
  "monthIndex": 0,
  "status": "submissions_open|voting|archived",
  "entries": [
    {
      "id": 1,
      "photographer": "Photographer Name",
      "filename": "photos/2026-01/Photographer Name/1.jpg"
    }
  ],
  "votesCast": 0,
  "createdBy": "monthlyContestTrigger"
}
```

## 🚀 Deployment Instructions

### 1. Install Dependencies
```bash
cd functions
npm install
```

### 2. Configure Firebase Project
```bash
# Login to Firebase
firebase login

# Set your project (replace with your project ID)
firebase use your-project-id
```

### 3. Deploy the Function
```bash
# Deploy only the monthlyContestTrigger function
firebase deploy --only functions:monthlyContestTrigger

# Or deploy all functions
firebase deploy --only functions
```

### 4. Verify Deployment
```bash
# Check function logs
firebase functions:log --only monthlyContestTrigger

# List deployed functions
firebase functions:list
```

## 🧪 Testing

### Test Function Locally
```bash
# Set up service account key for local testing
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"

# Run test script
node test-function.js
```

### Manual Testing
1. Create test contests in Firestore with appropriate dates
2. Add mock votes
3. Trigger function manually:
   ```bash
   # Test with emulator
   firebase emulators:start --only functions
   
   # Or trigger via Firebase Console
   # Go to Cloud Functions > monthlyContestTrigger > Execute
   ```

## 📅 Scheduling

The function is scheduled to run automatically:
- **Schedule**: `1 0 1 * *` (1st minute, 0th hour, 1st day, every month)
- **Time Zone**: UTC
- **Frequency**: Monthly on the 1st at 00:01 UTC

## 🛠️ Configuration

### Date Format
- Uses ISO format for contest IDs: `YYYY-MM` (e.g., "2026-01")
- Human-readable month names: "January 2026"

### Status Flow
- `submissions_open` → `voting` → `archived`

### Winner Calculation
- Based on vote counts in `contests/{contestId}/votes` collection
- Top 3 entries by vote count become Gold/Silver/Bronze winners
- Handles ties by keeping entries in vote count order

## 🔍 Monitoring

### Check Function Logs
```bash
# Real-time logs
firebase functions:log --only monthlyContestTrigger --follow

# Recent logs
firebase functions:log --only monthlyContestTrigger
```

### Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to Cloud Functions
4. View function details and execution history

## 🐛 Troubleshooting

### Common Issues

1. **Function not triggering**
   - Check scheduling configuration
   - Verify time zone settings
   - Check Firebase quotas and limits

2. **Firestore permission errors**
   - Ensure service account has proper permissions
   - Check Firestore security rules

3. **Date calculation issues**
   - Function uses UTC timezone
   - Verify date boundaries logic
   - Check month/year transitions

### Debug Mode
Enable debug logging by checking function logs:
```bash
firebase functions:log --only monthlyContestTrigger --filter="severity=DEBUG"
```

## 📋 Data Migration from JSON

If migrating from your current `database.json` structure:

1. **Export current data**:
   ```javascript
   // Use the existing JSON structure
   const currentData = require('./database.json');
   ```

2. **Transform to Firestore**:
   - `contests` collection: Current active contest
   - `archives` collection: Historical contest data
   - Vote subcollections: Add voting data structure

3. **Import to Firestore**:
   ```bash
   # Use Firebase CLI to import data
   firebase firestore:import ./backup-folder
   ```

## 🔒 Security Considerations

- Function uses Firebase Admin SDK with service account
- All operations are server-side only
- No direct client access to voting logic
- Automatic timestamp handling for consistency

## 📈 Performance

- Optimized for minimal Firestore operations
- Batch operations where possible
- Efficient date calculations
- Proper error handling and rollback

## 🤝 Support

For issues or questions:
1. Check function logs first
2. Verify Firestore data structure
3. Test with emulator before deployment
4. Review Firebase documentation for Cloud Functions

---

**Last Updated**: December 22, 2025  
**Version**: 1.0.0  
**Firebase Functions**: v6.0.1
