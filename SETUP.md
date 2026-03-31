# Monthly Habit Tracker - Development Setup

## Project Overview
A React-based habit tracking application with:
- Google OAuth authentication (Supabase)
- PostgreSQL database (Supabase)
- Claude AI for habit tips
- Dark/Light theme support
- Daily and monthly habit tracking

## Quick Start

### 1. Prerequisites
- Node.js 16+ and npm

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env.local` file in the project root:
```
REACT_APP_SUPABASE_URL=https://erhpdewgxthnvovkvpmf.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<your-key>
REACT_APP_ANTHROPIC_API_KEY=<your-claude-api-key>
```

### 4. Run Development Server
```bash
npm start
```
The app will open at `http://localhost:3000`

## Available Scripts

### `npm start`
- Runs the app in development mode
- Opens `http://localhost:3000` in your browser
- Automatically reloads on file changes

### `npm run build`
- Builds the app for production
- Output goes to the `build/` directory
- Optimized and minified for deployment

### `npm test`
- Runs the test suite in interactive watch mode

## Database Setup (Supabase)

The app expects the following tables in your Supabase project:

### 1. habits table
```sql
CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  color VARCHAR(7),
  reminder_time TIME,
  created_at TIMESTAMP DEFAULT now()
);
```

### 2. habit_logs table
```sql
CREATE TABLE habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);
```

### 3. profiles table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  theme VARCHAR(10) DEFAULT 'light',
  created_at TIMESTAMP DEFAULT now()
);
```

## Key Features
- ✅ Google OAuth authentication
- ✅ Create, read, update, delete habits
- ✅ Track daily habit completion
- ✅ View monthly progress with calendar
- ✅ AI-powered habit tips with Claude
- ✅ Dark/Light theme toggle
- ✅ Habit streaks calculation
- ✅ Persistent data with Supabase

## Troubleshooting

### Port 3000 already in use?
```bash
PORT=3001 npm start
```

### Supabase connection issues
- Verify `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` in `.env.local`
- Check that tables exist in your Supabase project
- Ensure Row Level Security (RLS) is configured correctly

### AI features not working
- Verify `REACT_APP_ANTHROPIC_API_KEY` is set
- Check your Claude API quota and billing
- AI features gracefully degrade if API key is missing

## Development Tips
- Use React DevTools browser extension for debugging
- Check the browser console for API errors
- Supabase dashboard is at `https://app.supabase.com`
- Claude API docs: `https://docs.anthropic.com`

## Project Structure
```
src/
├── App.jsx           # Main app component
├── index.js          # Entry point
├── index.css         # Global styles
└── [other components]
public/
├── index.html        # HTML template
└── manifest.json     # PWA manifest
```

## Next Steps
1. Set up environment variables in `.env.local`
2. Configure Supabase project and create tables
3. Run `npm install` to install dependencies
4. Run `npm start` to begin development
5. Open `http://localhost:3000` in your browser
