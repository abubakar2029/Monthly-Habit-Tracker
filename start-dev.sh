#!/bin/bash

# Monthly Habit Tracker - Development Startup Script

echo "🚀 Monthly Habit Tracker - Dev Setup"
echo "===================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found!"
    echo "Creating from template..."
    cp .env.example .env.local
    echo "✅ Created .env.local"
    echo ""
    echo "📝 Please edit .env.local and add your:"
    echo "   - REACT_APP_SUPABASE_URL"
    echo "   - REACT_APP_SUPABASE_ANON_KEY"
    echo "   - REACT_APP_ANTHROPIC_API_KEY (optional)"
    echo ""
fi

echo "✅ Setup complete!"
echo ""
echo "Starting development server..."
echo "📱 App will open at http://localhost:3000"
echo ""
echo "Available commands:"
echo "  npm start   - Start dev server"
echo "  npm build   - Build for production"
echo "  npm test    - Run tests"
echo ""

# Start the development server
npm start
