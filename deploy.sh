#!/bin/bash

# Photography Contest Monthly Automation - Deployment Script
# This script helps deploy the monthlyContestTrigger Cloud Function

echo "🚀 Photography Contest Monthly Automation - Deployment Script"
echo "================================================================"

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Navigate to functions directory
echo "📦 Installing function dependencies..."
cd functions
npm install

# Go back to project root
cd ..

# Check if user is logged in
echo "🔐 Checking Firebase authentication..."
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Please run:"
    echo "   firebase login"
    exit 1
fi

# List available projects
echo "📋 Available Firebase projects:"
firebase projects:list

echo ""
echo "🔧 Configuration Steps:"
echo "1. Make sure you're in the correct directory: $(pwd)"
echo "2. Set your Firebase project: firebase use YOUR_PROJECT_ID"
echo "3. Deploy the function: firebase deploy --only functions:monthlyContestTrigger"
echo ""
echo "📖 For detailed instructions, see: FUNCTIONS_README.md"
echo ""
echo "🎯 Quick Deployment Commands:"
echo "   firebase login"
echo "   firebase use YOUR_PROJECT_ID" 
echo "   firebase deploy --only functions:monthlyContestTrigger"
echo ""
echo "📊 Monitor function execution:"
echo "   firebase functions:log --only monthlyContestTrigger --follow"
