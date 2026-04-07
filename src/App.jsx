import { useState, useEffect, useRef, useCallback } from "react";
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

const COLORS = ["#7F77DD", "#1D9E75", "#D85A30", "#378ADD", "#D4537E", "#BA7517", "#639922"];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const api = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts,
  headers: {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${opts._token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": opts.prefer || "",
    ...(opts.headers || {})
  }
});

function toYMDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getToday() {
  // return new Date().toISOString().split("T")[0]; 
  return toYMDate(new Date());
}
function getDaysInMonth(year, month) {
  const days = [];
  const d = new Date(year, month, 1);

  while (d.getMonth() === month) {
    days.push(toYMDate(d));
    d.setDate(d.getDate() + 1);
  }

  return days;
}


function loadTheme() { try { return localStorage.getItem("ht_theme") === "dark"; } catch { return window.matchMedia("(prefers-color-scheme: dark)").matches; } }
function saveTheme(dark) { try { localStorage.setItem("ht_theme", dark ? "dark" : "light"); } catch { } }

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState({});
  const [view, setView] = useState("month");
  const [dark, setDark] = useState(loadTheme);
  const [showAdd, setShowAdd] = useState(false);
  const [editHabit, setEditHabit] = useState(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState([]);
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteDate, setNoteDate] = useState(getToday());
  const [dataLoading, setDataLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [undoNote, setUndoNote] = useState(null);
  const [undoHabit, setUndoHabit] = useState(null);
  const undoTimer = useRef(null);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const today = getToday();
  const token = useRef(null);
  const calendarTableRef = useRef(null);

  // Responsive hook
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Calendar auto-scroll to today
  useEffect(() => {
    if (view === "month" && calendarTableRef.current && dataLoaded) {
      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        const container = calendarTableRef.current;
        if (!container) return;
        
        // Find today's header using data-date attribute
        const todayHeader = container.querySelector(`th[data-date="${today}"]`);
        if (!todayHeader) return;
        
        // Calculate scroll position accounting for sticky column
        const stickyColWidth = isMobile ? 120 : 160;
        const headerLeft = todayHeader.offsetLeft;
        const scrollTarget = Math.max(0, headerLeft - stickyColWidth - 20);
        
        // Smooth scroll to today
        container.scrollLeft = scrollTarget;
      });
    }
  }, [view, monthYear, today, isMobile, dataLoaded]);

  const loadData = useCallback(async (tok, uid) => {
    setDataLoading(true);
    try {
      const [hRes, lRes, nRes] = await Promise.all([
        api(`habits?user_id=eq.${uid}&order=created_at.asc`, { _token: tok, headers: { "Accept": "application/json" } }),
        api(`habit_logs?user_id=eq.${uid}`, { _token: tok, headers: { "Accept": "application/json" } }),
        api(`notes?user_id=eq.${uid}&order=date.desc`, { _token: tok, headers: { "Accept": "application/json" } })
      ]);
      const habitsData = await hRes.json();
      const logsData = await lRes.json();
      const notesData = await nRes.json();
      setHabits(Array.isArray(habitsData) ? habitsData : []);
      const logsMap = {};
      if (Array.isArray(logsData)) {
        logsData.forEach(l => {
          if (!logsMap[l.habit_id]) logsMap[l.habit_id] = {};
          logsMap[l.habit_id][l.date] = true;
        });
      }
      setLogs(logsMap);
      setNotes(Array.isArray(notesData) ? notesData : []);
    } catch (e) { console.error(e); }
    setDataLoading(false);
  }, []); // Add dependencies if any

  const ensureProfile = useCallback(async (tok, uid, email) => {
    const res = await api(`profiles?id=eq.${uid}`, { _token: tok, headers: { "Accept": "application/json" } });
    const data = await res.json();
    if (!data.length) {
      await api("profiles", {
        method: "POST", _token: tok, prefer: "return=minimal",
        body: JSON.stringify({ id: uid, email, theme: dark ? "dark" : "light" })
      });
      // Add default habits for new users
      const defaultHabits = [
        { user_id: uid, name: "5 prayers", color: COLORS[0], created_at: today },
        { user_id: uid, name: "Wake up at 5:00 ⏰", color: COLORS[1], created_at: today }
      ];
      for (const habit of defaultHabits) {
        await api("habits", { method: "POST", _token: tok, prefer: "return=minimal", body: JSON.stringify(habit) });
      }
    } else {
      const savedTheme = data[0].theme;
      if (savedTheme) { setDark(savedTheme === "dark"); saveTheme(savedTheme === "dark"); }
    }
  }, [dark, today]);

  const checkSession = useCallback(async () => {
    try {
      const stored = localStorage.getItem("ht_session");
      if (stored) {
        const s = JSON.parse(stored);
        const now = Date.now() / 1000;
        // If token is expired, try to refresh it
        if (s.expires_at <= now) {
          if (s.refresh_token) {
            try {
              const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
                method: "POST",
                headers: { "apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: s.refresh_token })
              });
              if (res.ok) {
                const newAuth = await res.json();
                const refreshedSession = { 
                  ...s, 
                  access_token: newAuth.access_token, 
                  refresh_token: newAuth.refresh_token || s.refresh_token,
                  expires_at: now + (newAuth.expires_in || 3600) 
                };
                localStorage.setItem("ht_session", JSON.stringify(refreshedSession));
                token.current = newAuth.access_token;
                setSession(refreshedSession);
                await loadData(newAuth.access_token, s.user.id);
                setDataLoaded(true);
                setAuthLoading(false);
                return;
              }
            } catch (e) { console.error("Token refresh failed:", e); }
          }
          localStorage.removeItem("ht_session");
        } else {
          token.current = s.access_token;
          setSession(s);
          await loadData(s.access_token, s.user.id);
          setDataLoaded(true);
        }
      }
    } catch { }
    setAuthLoading(false);
  }, [loadData]
  )

  const handleOAuthCallback = useCallback(async () => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const expires_in = params.get("expires_in");
    if (!access_token) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${access_token}` }
      });
      const user = await res.json();
      const s = { access_token, refresh_token, user, expires_at: Date.now() / 1000 + parseInt(expires_in || 3600) };
      localStorage.setItem("ht_session", JSON.stringify(s));
      token.current = access_token;
      setSession(s);
      window.history.replaceState({}, document.title, window.location.pathname);
      await ensureProfile(access_token, user.id, user.email);
      await loadData(access_token, user.id);
      setDataLoaded(true);
    } catch (e) { console.error(e); }
    setAuthLoading(false);
  }, [ensureProfile, loadData]
  )

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    checkSession();
    // Listen for hash-based OAuth callback
    if (window.location.hash.includes("access_token")) {
      handleOAuthCallback();
    }
  }, [checkSession, handleOAuthCallback]);




  function signInWithGoogle() {
    const redirectTo = encodeURIComponent(window.location.href.split("#")[0]);
    window.location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
  }

  async function signOut() {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST", headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${token.current}` }
      });
    } catch { }
    localStorage.removeItem("ht_session");
    token.current = null;
    setSession(null); setHabits([]); setLogs({});
  }

  // ── Theme sync ────────────────────────────────────────
  useEffect(() => {
    saveTheme(dark);
    if (session) {
      api(`profiles?id=eq.${session.user.id}`, {
        method: "PATCH", _token: token.current, prefer: "return=minimal",
        body: JSON.stringify({ theme: dark ? "dark" : "light" })
      }).catch(() => { });
    }
  }, [dark, session]);

  // ── Habits CRUD ───────���───────────────────────────────
  const toggleLog = async (habitId, date) => {
    const done = !!logs[habitId]?.[date];
    setLogs(prev => {
      const copy = { ...prev, [habitId]: { ...(prev[habitId] || {}) } };
      if (done) delete copy[habitId][date]; else copy[habitId][date] = true;
      return copy;
    });
    if (done) {
      await api(`habit_logs?habit_id=eq.${habitId}&date=eq.${date}`, { method: "DELETE", _token: token.current });
    } else {
      await api("habit_logs", {
        method: "POST", _token: token.current, prefer: "return=minimal",
        body: JSON.stringify({ habit_id: habitId, user_id: session.user.id, date })
      });
    }
  };

  const addHabit = async () => {
    if (!newName.trim()) return;
    if (editHabit) {
      const updated = { name: newName, color: newColor };
      setHabits(h => h.map(x => x.id === editHabit ? { ...x, ...updated } : x));
      await api(`habits?id=eq.${editHabit}`, { method: "PATCH", _token: token.current, prefer: "return=minimal", body: JSON.stringify(updated) });
      setEditHabit(null);
    } else {
      const newH = { user_id: session.user.id, name: newName, color: newColor, created_at: today };
      const res = await api("habits", { method: "POST", _token: token.current, prefer: "return=representation", headers: { "Accept": "application/json" }, body: JSON.stringify(newH) });
      const data = await res.json();
      setHabits(h => [...h, ...data]);
    }
    setNewName(""); setNewColor(COLORS[0]); setShowAdd(false);
  };

  const deleteHabit = async id => {
    const habitToDelete = habits.find(h => h.id === id);
    if (!habitToDelete) return;
    
    const oldLogs = logs[id];
    
    // Remove from UI immediately
    setHabits(h => h.filter(x => x.id !== id));
    setLogs(l => { const c = { ...l }; delete c[id]; return c; });
    setUndoHabit({ habit: habitToDelete, logs: oldLogs, timer: null });
    
    // Clear existing timer if any
    if (undoTimer.current) clearTimeout(undoTimer.current);
    
    // Set 5-second undo timer
    const timer = setTimeout(async () => {
      try {
        await api(`habit_logs?habit_id=eq.${id}`, { method: "DELETE", _token: token.current });
        await api(`habits?id=eq.${id}`, { method: "DELETE", _token: token.current });
        setUndoHabit(null);
      } catch (e) { 
        console.error(e);
        // Restore habit if deletion fails
        setHabits(h => [...h, habitToDelete]);
        if (oldLogs) {
          setLogs(l => ({ ...l, [id]: oldLogs }));
        }
        setUndoHabit(null);
      }
    }, 5000);
    
    undoTimer.current = timer;
  };

  const openEdit = h => { setEditHabit(h.id); setNewName(h.name); setNewColor(h.color); setShowAdd(true); };

  const addNote = async () => {
    if (!noteContent.trim()) return;
    const newNote = { user_id: session.user.id, content: noteContent, date: noteDate };
    try {
      await api("notes", {
        method: "POST", _token: token.current, prefer: "return=minimal",
        body: JSON.stringify(newNote)
      });
      const updatedNotes = await api(`notes?user_id=eq.${session.user.id}&order=date.desc`, { _token: token.current, headers: { "Accept": "application/json" } });
      const data = await updatedNotes.json();
      setNotes(Array.isArray(data) ? data : []);
      setNoteContent("");
      setNoteDate(getToday());
      setShowAddNote(false);
    } catch (e) { console.error(e); }
  };

  const deleteNote = async (id) => {
    const noteToDelete = notes.find(n => n.id === id);
    if (!noteToDelete) return;
    
    // Remove from UI immediately
    setNotes(n => n.filter(note => note.id !== id));
    setUndoNote({ note: noteToDelete, timer: null });
    
    // Clear existing timer if any
    if (undoTimer.current) clearTimeout(undoTimer.current);
    
    // Set 5-second undo timer
    const timer = setTimeout(async () => {
      try {
        await api(`notes?id=eq.${id}`, { method: "DELETE", _token: token.current });
        setUndoNote(null);
      } catch (e) { 
        console.error(e);
        // Restore note if deletion fails
        setNotes(n => [...n, noteToDelete]);
        setUndoNote(null);
      }
    }, 3500);
    
    undoTimer.current = timer;
  };

  const restoreNote = () => {
    if (undoNote) {
      setNotes(n => [...n, undoNote.note]);
      setUndoNote(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    }
  };

  const restoreHabit = () => {
    if (undoHabit) {
      setHabits(h => [...h, undoHabit.habit]);
      if (undoHabit.logs) {
        setLogs(l => ({ ...l, [undoHabit.habit.id]: undoHabit.logs }));
      }
      setUndoHabit(null);
      if (undoTimer.current) clearTimeout(undoTimer.current);
    }
  };




  // ── Theme tokens ────────���─────────────────────────────
  const bg = dark ? "#0f0f0f" : "#fafaf9";
  const card = dark ? "#1a1a1a" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const text = dark ? "#f5f5f4" : "#1a1a1a";
  const muted = dark ? "#a1a09d" : "#78776e";
  const inputBg = dark ? "#252525" : "#f5f4f0";
  const cellBg = dark ? "#262626" : "#f9f8f7";
  const accent = "#6b5cff";

  const todayDone = habits.filter(h => logs[h.id]?.[today]).length;
  const { year, month } = monthYear;
  const monthDays = getDaysInMonth(year, month);
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long", year: "numeric" });
  const prevMonth = () => setMonthYear(({ year: y, month: m }) => m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 });
  const nextMonth = () => setMonthYear(({ year: y, month: m }) => m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 });

  // ── Login screen ──────────────────────────────────────
  if (authLoading) return (
    <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: muted, fontSize: 14 }}>Loading...</div>
    </div>
  );

  if (!session) return (
    <div style={{ background: bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: isMobile ? "flex-start" : "center", padding: isMobile ? "20px 16px" : 24, paddingTop: isMobile ? 80 : 0 }}>
      <div style={{ background: isMobile ? "transparent" : card, borderRadius: isMobile ? 0 : 20, border: isMobile ? "none" : `1px solid ${border}`, padding: isMobile ? "40px 20px 60px" : "48px 40px", maxWidth: isMobile ? "100%" : 380, width: "100%", textAlign: "center", boxShadow: dark || isMobile ? "none" : "0 2px 12px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: isMobile ? 56 : 48, marginBottom: isMobile ? 20 : 16 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 28 : 26, color: text, marginBottom: isMobile ? 16 : 12, letterSpacing: "-0.5px" }}>Habit Tracker</div>
        <div style={{ fontSize: isMobile ? 15 : 15, color: muted, marginBottom: isMobile ? 40 : 36, lineHeight: 1.7, maxWidth: isMobile ? "100%" : "320px" }}>Build lasting habits, track daily progress, and get personalized AI coaching to achieve your goals.</div>
        <button onClick={signInWithGoogle} style={{
          width: "100%", padding: isMobile ? "16px 20px" : "14px 20px", borderRadius: isMobile ? 12 : 10, border: isMobile ? "none" : `1px solid ${border}`,
          background: isMobile ? accent : card, color: isMobile ? "#fff" : text, fontSize: isMobile ? 14 : 15, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12, transition: "all 0.2s", boxShadow: isMobile ? "0 4px 12px rgba(107, 92, 255, 0.3)" : "none"
        }}>
          <svg width={isMobile ? 20 : 18} height={isMobile ? 20 : 18} viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill={isMobile ? "#fff" : "#4285F4"} /><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill={isMobile ? "#fff" : "#34A853"} /><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill={isMobile ? "#fff" : "#FBBC05"} /><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill={isMobile ? "#fff" : "#EA4335"} /></svg>
          {isMobile ? "Continue with Google" : "Continue with Google"}
        </button>
      </div>
    </div>
  );

  // ── Main App ───────────────────────────────────��──────
  const userInitial = (session.user.email || "U")[0].toUpperCase();

  return (
    <div style={{ background: bg, minHeight: "100vh", paddingBottom: 80, color: text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: "background 0.2s", fontSize: 16, lineHeight: 1.5 }}>
      <style>{`
        .scrollable-table::-webkit-scrollbar{height:4px}
        .scrollable-table::-webkit-scrollbar-track{background:transparent}
        .scrollable-table::-webkit-scrollbar-thumb{background:${muted};border-radius:2px}
        .scrollable-table{scrollbar-width:thin;scrollbar-color:${muted} transparent}
      `}</style>

      {/* Header */}
      <div style={{ background: card, borderBottom: `1px solid ${border}`, padding: isMobile ? "16px 16px" : "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: isMobile ? 18 : 24, letterSpacing: "-0.5px" }}>Habit Tracker</div>
          <div style={{ fontSize: isMobile ? 11 : 13, color: muted, marginTop: 4 }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
          <button onClick={() => setDark(d => !d)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 6, padding: isMobile ? "6px 10px" : "8px 14px", cursor: "pointer", fontSize: isMobile ? 11 : 13, color: muted, fontWeight: 500, transition: "all 0.2s" }}>{dark ? "☀️" : "🌙"}</button>
          <div style={{ width: isMobile ? 36 : 40, height: isMobile ? 36 : 40, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 14 : 16, fontWeight: 600, color: "#fff", cursor: "pointer", transition: "all 0.2s" }} title={session.user.email} onClick={() => { if (window.confirm("Are you sure you want to sign out?")) signOut(); }}>{userInitial}</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", borderBottom: `1px solid ${border}`, background: card, padding: isMobile ? "0 16px" : "0 32px", overflowX: "auto" }}>
        {["today", "month", "notes"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            background: "none", border: "none", padding: isMobile ? "12px 12px" : "16px 20px", cursor: "pointer",
            fontSize: isMobile ? 12 : 14, fontWeight: 500,
            color: view === v ? text : muted,
            borderBottom: view === v ? `3px solid ${accent}` : "3px solid transparent",
            marginBottom: -1,
            transition: "color 0.2s",
            whiteSpace: "nowrap"
          }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "16px 16px 0" : "32px 32px 0" }}>

        {dataLoading && <div style={{ textAlign: "center", color: muted, padding: "40px 0", fontSize: 13 }}>Loading your data...</div>}

        {/* TODAY */}
        {!dataLoading && view === "today" && <>
          <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: isMobile ? "16px 20px" : "24px 28px", marginBottom: isMobile ? 12 : 20 }}>
            <div style={{ fontSize: isMobile ? 11 : 13, color: muted, fontWeight: 500, letterSpacing: "0.5px", textTransform: "uppercase" }}>Today's Progress</div>
            <div style={{ fontSize: isMobile ? 36 : 48, fontWeight: 700, marginTop: isMobile ? 8 : 12, letterSpacing: "-1px" }}>{todayDone}/{habits.length}</div>
          </div>
          <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: isMobile ? "16px 20px" : "24px 28px", marginBottom: isMobile ? 12 : 20 }}>
            <div style={{ fontSize: isMobile ? 11 : 13, color: muted, fontWeight: 500, marginBottom: isMobile ? 12 : 16, letterSpacing: "0.5px", textTransform: "uppercase" }}>Overall Progress</div>
            <div style={{ height: 6, background: border, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${habits.length ? (todayDone / habits.length) * 100 : 0}%`, background: accent, borderRadius: 3, transition: "width 0.4s" }}></div>
            </div>
          </div>
          {habits.length === 0 && <div style={{ textAlign: "center", color: muted, padding: isMobile ? "40px 20px" : "60px 32px", fontSize: isMobile ? 14 : 16 }}>No habits yet. Add your first one!</div>}
          {habits.map(h => {
            const done = !!logs[h.id]?.[today];
            const s = monthDays.filter(d => logs[h.id]?.[d]).length;
            return (
              <div key={h.id} style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: isMobile ? "12px 14px" : "20px 24px", marginBottom: isMobile ? 8 : 12, display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, transition: "all 0.2s" }}>
                <button onClick={() => toggleLog(h.id, today)} style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: "50%", border: `2.5px solid ${done ? h.color : border}`, background: done ? h.color : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                  {done && <svg width={isMobile ? 14 : 16} height={isMobile ? 14 : 16} viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: isMobile ? 14 : 16, textDecoration: done ? "line-through" : "none", color: done ? muted : text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                  <div style={{ fontSize: isMobile ? 11 : 13, color: h.color, marginTop: 2, fontWeight: 600 }}>{

                    s === monthDays.length && monthDays.length > 0 ? "🔥 " : ""}
                    {s} day{s !== 1 ? "s" : ""} completed

                  </div>
                </div>
                <div style={{ display: "flex", gap: isMobile ? 6 : 10, flexShrink: 0 }}>
                  <button onClick={() => openEdit(h)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: isMobile ? 11 : 13, fontWeight: 500, padding: isMobile ? "4px 8px" : "6px 12px", borderRadius: 6, transition: "all 0.2s" }}>Edit</button>
                  <button onClick={() => deleteHabit(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e24b4a", fontSize: isMobile ? 11 : 13, fontWeight: 500, padding: isMobile ? "4px 8px" : "6px 12px", borderRadius: 6, transition: "all 0.2s" }}>Del</button>
                </div>
              </div>
            );
          })}
          <button onClick={() => { setShowAdd(true); setEditHabit(null); setNewName(""); setNewColor(COLORS[0]); }} style={{ width: "100%", background: accent, border: "none", borderRadius: 12, padding: isMobile ? "14px 20px" : "16px 24px", cursor: "pointer", color: "#fff", fontSize: isMobile ? 14 : 15, fontWeight: 600, marginTop: isMobile ? 16 : 20, transition: "all 0.2s" }}>+ Add New Habit</button>
        </>}

        {/* MONTH */}
        {!dataLoading && view === "month" && <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 16 : 28 }}>
            <button onClick={prevMonth} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", cursor: "pointer", color: text, fontSize: isMobile ? 14 : 18, fontWeight: 500, transition: "all 0.2s" }}>←</button>
            <div style={{ fontWeight: 600, fontSize: isMobile ? 16 : 22, letterSpacing: "-0.5px" }}>{monthName}</div>
            <button onClick={nextMonth} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: isMobile ? "6px 12px" : "8px 16px", cursor: "pointer", color: text, fontSize: isMobile ? 14 : 18, fontWeight: 500, transition: "all 0.2s" }}>→</button>
          </div>

          <div ref={calendarTableRef} className="scrollable-table" style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, marginBottom: isMobile ? 20 : 32, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: "100%", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: isMobile ? "10px 12px" : "14px 16px", color: muted, fontWeight: 600, fontSize: isMobile ? 11 : 13, borderBottom: `1px solid ${border}`, position: "sticky", left: 0, background: card, zIndex: 2, minWidth: isMobile ? 100 : 140, whiteSpace: "nowrap" }}>Habit</th>
                  {monthDays.map(d => {
                    const dt = new Date(d + "T00:00:00"), isToday = d === today;
                    return (
                      <th key={d} data-date={d} style={{ padding: isMobile ? "8px 4px" : "12px 6px", minWidth: isMobile ? 24 : 28, textAlign: "center", borderBottom: `1px solid ${border}`, fontWeight: 500 }}>
                        <div style={{ color: isToday ? accent : muted, fontSize: isMobile ? 9 : 11, fontWeight: 600 }}>{DAY_LABELS[dt.getDay()]}</div>
                        <div style={{ color: isToday ? accent : text, fontSize: isMobile ? 10 : 12, fontWeight: isToday ? 700 : 600, marginTop: 2, background: isToday ? border : "transparent", padding: isToday ? "2px 4px" : "0", borderRadius: 4 }}>{dt.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {habits.map((h, hi) => (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${border}` }}>
                    <td style={{ padding: isMobile ? "10px 12px" : "14px 16px", position: "sticky", left: 0, background: card, zIndex: 1, maxWidth: isMobile ? 120 : 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: h.color, flexShrink: 0 }}></div>
                        <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 500, color: text, overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
                      </div>
                    </td>
                    {monthDays.map(d => {
                      const done = !!logs[h.id]?.[d], isFuture = d > today;
                      return (
                        <td key={d} style={{ textAlign: "center", padding: isMobile ? "8px 4px" : "12px 6px" }}>
                          <button onClick={() => !isFuture && toggleLog(h.id, d)} style={{ width: isMobile ? 18 : 20, height: isMobile ? 18 : 20, borderRadius: "50%", border: `2px solid ${done ? h.color : border}`, background: done ? h.color : "transparent", cursor: isFuture ? "default" : "pointer", opacity: isFuture ? 0.3 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "all 0.2s" }}>
                            {done && <svg width={isMobile ? 8 : 10} height={isMobile ? 8 : 10} viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: isMobile ? "10px 12px" : "14px 16px", fontSize: isMobile ? 11 : 13, color: muted, fontWeight: 600, borderTop: `1px solid ${border}`, position: "sticky", left: 0, background: card, zIndex: 1, whiteSpace: "nowrap" }}>Daily Total</td>
                  {monthDays.map(d => {
                    const isFuture = d > today, done = habits.filter(h => logs[h.id]?.[d]).length;
                    const pct = habits.length ? Math.round((done / habits.length) * 100) : 0;
                    const barH = isMobile ? 28 : 36, fillH = Math.round((pct / 100) * barH);
                    return (
                      <td key={d} style={{ textAlign: "center", padding: isMobile ? "8px 4px" : "12px 6px", borderTop: `1px solid ${border}` }}>
                        <div title={`${pct}%`} style={{ width: isMobile ? 10 : 12, height: barH, background: cellBg, borderRadius: 3, display: "inline-flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden", opacity: isFuture ? 0.3 : 1, margin: "0 auto" }}>
                          <div style={{ width: "100%", height: fillH, borderRadius: 2, background: pct === 100 ? "#1D9E75" : pct >= 60 ? accent : pct > 0 ? "#BA7517" : "transparent", transition: "height 0.3s" }}></div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ background: card, borderRadius: 12, border: `1px solid ${border}`, padding: isMobile ? "16px 20px" : "24px 28px", marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: isMobile ? 14 : 16, marginBottom: isMobile ? 14 : 20, letterSpacing: "-0.5px" }}>Monthly Summary</div>
            {habits.length === 0 && <div style={{ textAlign: "center", color: muted, padding: isMobile ? "16px 0" : "24px 0", fontSize: isMobile ? 13 : 14 }}>No habits to summarize.</div>}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 13 : 14 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${border}` }}>
                  <th style={{ textAlign: "left", padding: isMobile ? "10px 0" : "12px 0", color: muted, fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>Habit</th>
                  <th style={{ textAlign: "center", padding: isMobile ? "10px 8px" : "12px 12px", color: muted, fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>Count</th>
                  <th style={{ textAlign: "right", padding: isMobile ? "10px 0" : "12px 0", color: muted, fontWeight: 600, fontSize: isMobile ? 11 : 13 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {habits.map(h => {
                  const count = monthDays.filter(d => logs[h.id]?.[d]).length;
                  const elapsed = monthDays.filter(d => d <= today).length;
                  const pct = elapsed ? Math.round((count / elapsed) * 100) : 0;
                  return (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${border}` }}>
                      <td style={{ padding: isMobile ? "10px 0" : "14px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: h.color, flexShrink: 0 }}></div>
                          <span style={{ color: text, fontWeight: 500, fontSize: isMobile ? 12 : 14 }}>{h.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "center", padding: isMobile ? "10px 8px" : "14px 12px", color: text, fontWeight: 600, fontSize: isMobile ? 13 : 15 }}>{count}</td>
                      <td style={{ padding: isMobile ? "10px 0" : "14px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 10, justifyContent: "flex-end" }}>
                          <div style={{ width: isMobile ? 50 : 70, height: 5, background: cellBg, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: h.color, borderRadius: 3, transition: "width 0.3s" }}></div>
                          </div>
                          <span style={{ color: muted, fontSize: isMobile ? 11 : 13, fontWeight: 600, minWidth: isMobile ? 28 : 35, textAlign: "right" }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>}

        {/* NOTES */}
        {!dataLoading && view === "notes" && <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 16 : 24 }}>
            <div style={{ fontWeight: 600, fontSize: isMobile ? 18 : 24, letterSpacing: "-0.5px" }}>Notes</div>
            {!isMobile && <button onClick={() => { setShowAddNote(true); setNoteContent(""); setNoteDate(getToday()); }} style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer", fontSize: 14, fontWeight: 600, transition: "all 0.2s" }}>+ Add Note</button>}
          </div>
          {isMobile && <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50 }}>
            <button onClick={() => { setShowAddNote(true); setNoteContent(""); setNoteDate(getToday()); }} style={{ width: 56, height: 56, background: accent, color: "#fff", border: "none", borderRadius: 28, cursor: "pointer", fontSize: 24, fontWeight: 600, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(107, 92, 255, 0.3)" }}>+</button>
          </div>}
          {notes.length === 0 ? (
            <div style={{ textAlign: "center", color: muted, padding: isMobile ? "40px 20px" : "60px 32px", fontSize: isMobile ? 14 : 16 }}>No notes yet. Start writing!</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: isMobile ? 14 : 18 }}>
              {notes.map(note => {
                const noteDateTime = new Date(note.date + "T00:00:00");
                const day = String(noteDateTime.getDate()).padStart(2, "0");
                const monthName = noteDateTime.toLocaleDateString("en-US", { month: "long" });
                const year = noteDateTime.getFullYear();
                const dateStr = `${day} / ${monthName} / ${year}`;
                return (
                  <div
                    key={note.id}
                    style={{
                      background: card,
                      borderRadius: 14,
                      border: `1px solid ${border}`,
                      padding: isMobile ? "14px 14px" : "16px 18px",
                      position: "relative",
                      transition: "all 0.2s",
                      display: "flex",
                      flexDirection: "column",
                      hover: { borderColor: accent }
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 12 }}>
                      <div style={{ fontSize: isMobile ? 11 : 12, color: muted, fontWeight: 600, letterSpacing: "0.6px", opacity: 0.65 }}>{dateStr}</div>
                      <button onClick={() => deleteNote(note.id)} style={{ background: "none", border: "none", color: muted, fontSize: isMobile ? 16 : 18, cursor: "pointer", padding: "2px 4px", transition: "color 0.2s", flexShrink: 0, opacity: 0.6, hover: { opacity: 1 } }} title="Delete note">×</button>
                    </div>
                    <div style={{ fontSize: isMobile ? 14 : 15, color: text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1, fontWeight: 400 }}>{note.content}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>}
      </div>

      {/* Add Note Modal */}
      {showAddNote && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) setShowAddNote(false); }}>
          <div style={{ background: card, borderRadius: "12px", padding: isMobile ? "24px 20px 32px" : "32px 28px 40px", width: "100%", maxWidth: 600, maxHeight: "85vh", overflowY: "auto", margin: isMobile ? "0 16px" : "0" }}>
            <div style={{ fontWeight: 700, fontSize: isMobile ? 18 : 22, marginBottom: 8, letterSpacing: "-0.5px" }}>Add Note</div>
            <div style={{ fontSize: isMobile ? 13 : 14, color: muted, marginBottom: isMobile ? 20 : 28 }}>Write something on your mind</div>
            <div style={{ marginBottom: isMobile ? 20 : 28 }}>
              <label style={{ fontSize: isMobile ? 11 : 13, color: muted, marginBottom: 6, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Note</label>
              <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Type your note here..." style={{ width: "100%", padding: isMobile ? "10px 12px" : "12px 14px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: text, fontSize: isMobile ? 13 : 14, boxSizing: "border-box", fontWeight: 500, fontFamily: "inherit", minHeight: 120, resize: "none" }} />
            </div>
            <div style={{ marginBottom: isMobile ? 20 : 28 }}>
              <label style={{ fontSize: isMobile ? 11 : 13, color: muted, marginBottom: 6, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</label>
              <div style={{ width: "90%", padding: isMobile ? "10px 12px" : "12px 14px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: text, fontSize: isMobile ? 13 : 14, fontWeight: 500 }}>
                {new Date(today + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>
            <div style={{ display: "flex", gap: isMobile ? 10 : 12 }}>
              <button onClick={() => setShowAddNote(false)} style={{ flex: 1, padding: isMobile ? "12px 14px" : "14px 16px", borderRadius: 8, border: `1px solid ${border}`, background: "none", color: text, cursor: "pointer", fontSize: isMobile ? 13 : 15, fontWeight: 600, transition: "all 0.2s" }}>Cancel</button>
              <button onClick={addNote} style={{ flex: 1.2, padding: isMobile ? "12px 14px" : "14px 16px", borderRadius: 8, border: "none", background: accent, color: "#fff", cursor: "pointer", fontSize: isMobile ? 13 : 15, fontWeight: 600, transition: "all 0.2s" }}>Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setEditHabit(null); } }}>
          <div style={{ background: card, borderRadius: "12px", padding: isMobile ? "24px 20px 32px" : "32px 28px 40px", width: "100%", maxWidth: 600, maxHeight: "85vh", overflowY: "auto", margin: isMobile ? "0 16px" : "0" }}>
            <div style={{ fontWeight: 700, fontSize: isMobile ? 18 : 22, marginBottom: 8, letterSpacing: "-0.5px" }}>{editHabit ? "Edit Habit" : "Create New Habit"}</div>
            <div style={{ fontSize: isMobile ? 13 : 14, color: muted, marginBottom: isMobile ? 20 : 28 }}>Set up a habit to track daily</div>
            <div style={{ marginBottom: isMobile ? 16 : 20 }}>
              <label style={{ fontSize: isMobile ? 11 : 13, color: muted, marginBottom: 6, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Habit Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g., Meditate for 10 minutes" style={{ width: "100%", padding: isMobile ? "10px 12px" : "12px 14px", borderRadius: 8, border: `1px solid ${border}`, background: inputBg, color: text, fontSize: isMobile ? 13 : 14, boxSizing: "border-box", fontWeight: 500 }} onKeyDown={e => e.key === "Enter" && addHabit()} />
            </div>
            <div style={{ marginBottom: isMobile ? 20 : 28 }}>
              <label style={{ fontSize: isMobile ? 11 : 13, color: muted, marginBottom: isMobile ? 8 : 12, display: "block", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Color</label>
              <div style={{ display: "flex", gap: isMobile ? 10 : 12, flexWrap: "wrap" }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: "50%", background: c, border: `3px solid ${newColor === c ? text : "transparent"}`, cursor: "pointer", transition: "all 0.2s" }} title="Select color"></button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: isMobile ? 10 : 12 }}>
              <button onClick={() => { setShowAdd(false); setEditHabit(null); }} style={{ flex: 1, padding: isMobile ? "12px 14px" : "14px 16px", borderRadius: 8, border: `1px solid ${border}`, background: "none", color: text, cursor: "pointer", fontSize: isMobile ? 13 : 15, fontWeight: 600, transition: "all 0.2s" }}>Cancel</button>
              <button onClick={addHabit} style={{ flex: 1.2, padding: isMobile ? "12px 14px" : "14px 16px", borderRadius: 8, border: "none", background: accent, color: "#fff", cursor: "pointer", fontSize: isMobile ? 13 : 15, fontWeight: 600, transition: "all 0.2s" }}>{editHabit ? "Save Changes" : "Create Habit"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {(undoNote || undoHabit) && (
        <div style={{ position: "fixed", bottom: isMobile ? 16 : 24, left: isMobile ? 16 : 24, background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          <div style={{ flex: 1, fontSize: isMobile ? 13 : 14, color: text, fontWeight: 500 }}>{undoNote ? "Note deleted" : "Habit deleted"}</div>
          <button onClick={undoNote ? restoreNote : restoreHabit} style={{ background: accent, border: "none", borderRadius: 6, padding: "6px 12px", cursor: "pointer", color: "#fff", fontSize: isMobile ? 12 : 13, fontWeight: 600, whiteSpace: "nowrap", transition: "all 0.2s" }}>Undo</button>
        </div>
      )}
    </div>
  );
}
