# Development Guide - Monthly Habit Tracker

## Getting Started

### 1. Clone & Install
```bash
git clone https://github.com/abubakar2029/Monthly-Habit-Tracker.git
cd Monthly-Habit-Tracker
npm install
```

### 2. Environment Setup
Copy `.env.example` to `.env.local` and fill in your credentials:
```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
REACT_APP_SUPABASE_URL=your_url
REACT_APP_SUPABASE_ANON_KEY=your_key
REACT_APP_ANTHROPIC_API_KEY=your_claude_key
```

### 3. Database Setup
1. Go to [Supabase Console](https://app.supabase.com)
2. Create a new project or use existing
3. Go to SQL Editor
4. Copy contents of `scripts/setup-db.sql`
5. Paste and execute in Supabase SQL Editor

### 4. Start Development
```bash
npm start
```
Opens at `http://localhost:3000`

## Architecture Overview

### Frontend Stack
- **React 19.2.4** - UI framework
- **React Hooks** - State management
- **CSS** - Styling (dark/light themes)
- **Testing Library** - Testing utilities

### Backend Stack
- **Supabase** - Authentication, Database, Real-time
- **PostgreSQL** - Data storage
- **Claude API** - AI habit tips

### Key Components
- `App.jsx` - Main application container
- Auth handling with Supabase
- Habit CRUD operations
- Daily/monthly tracking views

## Development Workflow

### Hot Reload
Changes to `.jsx`, `.js`, and `.css` files automatically refresh in browser

### Debugging
1. Open React DevTools browser extension
2. Check browser console for errors
3. Supabase logs in project dashboard

### Testing
```bash
npm test
```
Run tests in watch mode

### Build for Production
```bash
npm run build
```
Creates optimized build in `build/` directory

## Code Standards

### File Structure
- Use descriptive component names
- Keep components focused and reusable
- Extract logic into custom hooks
- Use meaningful variable names

### Styling
- CSS files co-located with components
- Support dark/light themes via CSS variables
- Mobile-first responsive design

### API Calls
- Use Supabase client from App.jsx
- Handle errors gracefully
- Show loading states
- Implement optimistic updates where possible

## Common Tasks

### Adding a New Feature
1. Create component file (e.g., `NewFeature.jsx`)
2. Create corresponding CSS file
3. Import in `App.jsx`
4. Handle Supabase operations if needed
5. Write tests in `NewFeature.test.js`

### Adding a Database Table
1. Create migration in `scripts/`
2. Update RLS policies
3. Create indexes for performance
4. Add corresponding Supabase queries in component

### Debugging Supabase Issues
1. Check RLS policies are correct
2. Verify user is authenticated
3. Check browser console for error messages
4. Review Supabase logs in dashboard

## Deployment

### To Vercel
1. Push to GitHub
2. Connect repo to Vercel project
3. Add environment variables in Vercel settings
4. Deploy automatically on push

### Environment Variables for Production
```
REACT_APP_SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY
REACT_APP_ANTHROPIC_API_KEY
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Port 3000 in use | `PORT=3001 npm start` |
| Dependencies not installing | `rm -rf node_modules && npm install` |
| Module not found | Clear cache: `npm start` then refresh |
| Supabase auth failing | Check Supabase URL/key in `.env.local` |
| AI features not working | Verify Claude API key and billing |
| Database errors | Run `scripts/setup-db.sql` in Supabase |

## Resources

- [React Documentation](https://react.dev)
- [Supabase Docs](https://supabase.com/docs)
- [Claude API Documentation](https://docs.anthropic.com)
- [Create React App Docs](https://create-react-app.dev)

## Performance Tips

1. Use `React.memo()` to prevent unnecessary re-renders
2. Implement lazy loading for large lists
3. Cache API responses where possible
4. Monitor bundle size with `npm build`
5. Use browser DevTools Performance tab

## Security Notes

- Never commit `.env.local` to git
- Keep API keys in environment variables
- Validate all user inputs
- Use Supabase RLS policies
- Enable HTTPS in production
- Review Supabase security settings regularly
