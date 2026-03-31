import { useState, useEffect, useRef, useCallback } from "react";
const SUPABASE_URL = "https://erhpdewgxthnvovkvpmf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyaHBkZXdneHRobnZvdmt2cG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NTAwNzYsImV4cCI6MjA5MDUyNjA3Nn0.XLAMCY_xdjsRRtuC9AM2-ijBNPqdeAOo1UXHbqFdPxk";

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

function getToday() { return new Date().toISOString().split("T")[0]; }
// function genId() { return "h" + Date.now(); }  
function getDaysInMonth(year, month) {
  const days = [], d = new Date(year, month, 1);
  while (d.getMonth() === month) { days.push(d.toISOString().split("T")[0]); d.setDate(d.getDate() + 1); }
  return days;
}
function calcStreak(habitId, logs) {
  let count = 0, d = new Date();
  while (true) {
    const key = d.toISOString().split("T")[0];
    if (logs[habitId]?.[key]) { count++; d.setDate(d.getDate() - 1); } else break;
  }
  return count;
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
  const [newReminder, setNewReminder] = useState("08:00");
  const [newColor, setNewColor] = useState(COLORS[0]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTip, setAiTip] = useState("");
  const [aiError, setAiError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const today = getToday();
  const token = useRef(null);

  // ── Auth ──────────────────────────────────────────────
  useEffect(() => {
    checkSession();
    // Listen for hash-based OAuth callback
    if (window.location.hash.includes("access_token")) {
      handleOAuthCallback();
    }
  }, [checkSession, handleOAuthCallback]);



  const checkSession = useCallback(async () => {
    try {
      const stored = localStorage.getItem("ht_session");
      if (stored) {
        const s = JSON.parse(stored);
        if (s.expires_at > Date.now() / 1000) {
          token.current = s.access_token;
          setSession(s);
          await loadData(s.access_token, s.user.id);
        } else {
          localStorage.removeItem("ht_session");
        }
      }
    } catch { }
    setAuthLoading(false);
  }
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
    } catch (e) { console.error(e); }
    setAuthLoading(false);
  }
  )
  async function ensureProfile(tok, uid, email) {
    const res = await api(`profiles?id=eq.${uid}`, { _token: tok, headers: { "Accept": "application/json" } });
    const data = await res.json();
    if (!data.length) {
      await api("profiles", {
        method: "POST", _token: tok, prefer: "return=minimal",
        body: JSON.stringify({ id: uid, email, theme: dark ? "dark" : "light" })
      });
    } else {
      const savedTheme = data[0].theme;
      if (savedTheme) { setDark(savedTheme === "dark"); saveTheme(savedTheme === "dark"); }
    }
  }

  async function loadData(tok, uid) {
    setDataLoading(true);
    try {
      const [hRes, lRes] = await Promise.all([
        api(`habits?user_id=eq.${uid}&order=created_at.asc`, { _token: tok, headers: { "Accept": "application/json" } }),
        api(`habit_logs?user_id=eq.${uid}`, { _token: tok, headers: { "Accept": "application/json" } })
      ]);
      const habitsData = await hRes.json();
      const logsData = await lRes.json();
      setHabits(Array.isArray(habitsData) ? habitsData : []);
      const logsMap = {};
      if (Array.isArray(logsData)) {
        logsData.forEach(l => {
          if (!logsMap[l.habit_id]) logsMap[l.habit_id] = {};
          logsMap[l.habit_id][l.date] = true;
        });
      }
      setLogs(logsMap);
    } catch (e) { console.error(e); }
    setDataLoading(false);
  }

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

  // ── Habits CRUD ───────────────────────────────────────
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
      const updated = { name: newName, reminder: newReminder, color: newColor };
      setHabits(h => h.map(x => x.id === editHabit ? { ...x, ...updated } : x));
      await api(`habits?id=eq.${editHabit}`, { method: "PATCH", _token: token.current, prefer: "return=minimal", body: JSON.stringify(updated) });
      setEditHabit(null);
    } else {
      const newH = { user_id: session.user.id, name: newName, reminder: newReminder, color: newColor, created_at: today };
      const res = await api("habits", { method: "POST", _token: token.current, prefer: "return=representation", headers: { "Accept": "application/json" }, body: JSON.stringify(newH) });
      const data = await res.json();
      setHabits(h => [...h, ...data]);
    }
    setNewName(""); setNewReminder("08:00"); setNewColor(COLORS[0]); setShowAdd(false);
  };

  const deleteHabit = async id => {
    setHabits(h => h.filter(x => x.id !== id));
    setLogs(l => { const c = { ...l }; delete c[id]; return c; });
    await api(`habit_logs?habit_id=eq.${id}`, { method: "DELETE", _token: token.current });
    await api(`habits?id=eq.${id}`, { method: "DELETE", _token: token.current });
  };

  const openEdit = h => { setEditHabit(h.id); setNewName(h.name); setNewReminder(h.reminder || "08:00"); setNewColor(h.color); setShowAdd(true); };

  const getAiTip = async () => {
    setAiLoading(true); setAiTip(""); setAiError("");
    const summary = habits.map(h => `${h.name}: ${calcStreak(h.id, logs)}-day streak`).join("\n");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "You are a supportive habit coach. Give 2-3 short, encouraging, actionable tips. Be warm and specific. Under 120 words.",
          messages: [{ role: "user", content: `My habits:\n${summary}\nGive me personalized tips.` }]
        })
      });
      const data = await res.json();
      setAiTip(data.content?.[0]?.text || "No tips returned.");
    } catch { setAiError("Could not load AI tips. Please try again."); }
    setAiLoading(false);
  };

  // ── Theme tokens ──────────────────────────────────────
  const bg = dark ? "#1a1a1a" : "#f5f4f0";
  const card = dark ? "#242424" : "#ffffff";
  const border = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text = dark ? "#e8e6e0" : "#2c2c2a";
  const muted = dark ? "#888780" : "#888780";
  const inputBg = dark ? "#2e2e2e" : "#f9f8f5";
  const cellBg = dark ? "#2a2a2a" : "#f0ede8";

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
    <div style={{ background: bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: card, borderRadius: 16, border: `0.5px solid ${border}`, padding: "40px 32px", maxWidth: 360, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontWeight: 500, fontSize: 20, color: text, marginBottom: 8 }}>Habit Tracker</div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 32, lineHeight: 1.6 }}>Track your daily habits, build streaks, and grow with AI-powered coaching.</div>
        <button onClick={signInWithGoogle} style={{
          width: "100%", padding: "12px 20px", borderRadius: 10, border: `0.5px solid ${border}`,
          background: card, color: text, fontSize: 14, fontWeight: 500, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10
        }}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" /><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" /><path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" /><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" /></svg>
          Continue with Google
        </button>
      </div>
    </div>
  );

  // ── Main App ──────────────────────────────────────────
  const userInitial = (session.user.email || "U")[0].toUpperCase();

  return (
    <div style={{ background: bg, minHeight: "100vh", paddingBottom: 60, color: text, fontFamily: "system-ui,sans-serif", transition: "background 0.2s" }}>
      <style>{`
        .scrollable-table::-webkit-scrollbar{height:4px}
        .scrollable-table::-webkit-scrollbar-track{background:transparent}
        .scrollable-table::-webkit-scrollbar-thumb{background:${muted};border-radius:2px}
        .scrollable-table{scrollbar-width:thin;scrollbar-color:${muted} transparent}
      `}</style>

      {/* Header */}
      <div style={{ background: card, borderBottom: `0.5px solid ${border}`, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 17 }}>Habit Tracker</div>
          <div style={{ fontSize: 11, color: muted }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setDark(d => !d)} style={{ background: "none", border: `0.5px solid ${border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 11, color: muted }}>{dark ? "Light" : "Dark"}</button>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#7F77DD", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: "#fff", cursor: "pointer" }} title={session.user.email} onClick={() => { if (window.confirm("Are you sure you want to sign out?")) signOut(); }}>{userInitial}</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", borderBottom: `0.5px solid ${border}`, background: card, padding: "0 20px" }}>
        {["today", "month", "ai"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            background: "none", border: "none", padding: "12px 16px", cursor: "pointer",
            fontSize: 13, fontWeight: 500,
            color: view === v ? text : muted,
            borderBottom: view === v ? `2px solid ${text}` : "2px solid transparent",
            marginBottom: -1
          }}>{v === "ai" ? "AI tips" : v.charAt(0).toUpperCase() + v.slice(1)}</button>
        ))}
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 16px 0" }}>

        {dataLoading && <div style={{ textAlign: "center", color: muted, padding: "40px 0", fontSize: 13 }}>Loading your data...</div>}

        {/* TODAY */}
        {!dataLoading && view === "today" && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div style={{ background: card, borderRadius: 10, border: `0.5px solid ${border}`, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: muted }}>Today's progress</div>
              <div style={{ fontSize: 24, fontWeight: 500, marginTop: 2 }}>{todayDone}/{habits.length}</div>
            </div>
            <div style={{ background: card, borderRadius: 10, border: `0.5px solid ${border}`, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: muted }}>Completion</div>
              <div style={{ fontSize: 24, fontWeight: 500, marginTop: 2 }}>{habits.length ? Math.round((todayDone / habits.length) * 100) : 0}%</div>
            </div>
          </div>
          <div style={{ background: card, borderRadius: 10, border: `0.5px solid ${border}`, padding: "12px 14px", marginBottom: 16 }}>
            <div style={{ height: 8, background: border, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${habits.length ? (todayDone / habits.length) * 100 : 0}%`, background: "#7F77DD", borderRadius: 4, transition: "width 0.4s" }}></div>
            </div>
          </div>
          {habits.length === 0 && <div style={{ textAlign: "center", color: muted, padding: "40px 0", fontSize: 14 }}>No habits yet. Add your first one!</div>}
          {habits.map(h => {
            const done = !!logs[h.id]?.[today], s = calcStreak(h.id, logs);
            return (
              <div key={h.id} style={{ background: card, borderRadius: 12, border: `0.5px solid ${border}`, padding: "14px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => toggleLog(h.id, today)} style={{ width: 28, height: 28, borderRadius: "50%", border: `2px solid ${done ? h.color : border}`, background: done ? h.color : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                  {done && <svg width="14" height="14" viewBox="0 0 14 14"><polyline points="2,7 6,11 12,3" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 15, textDecoration: done ? "line-through" : "none", color: done ? muted : text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                    {h.reminder && <span style={{ marginRight: 10 }}>⏰ {h.reminder}</span>}
                    {s > 0 && <span style={{ color: h.color }}>🔥 {s} day streak</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => openEdit(h)} style={{ background: "none", border: "none", cursor: "pointer", color: muted, fontSize: 13, padding: "4px 6px" }}>Edit</button>
                  <button onClick={() => deleteHabit(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#E24B4A", fontSize: 13, padding: "4px 6px" }}>Del</button>
                </div>
              </div>
            );
          })}
          <button onClick={() => { setShowAdd(true); setEditHabit(null); setNewName(""); setNewReminder("08:00"); setNewColor(COLORS[0]); }} style={{ width: "100%", background: "none", border: `0.5px dashed ${border}`, borderRadius: 12, padding: "14px", cursor: "pointer", color: muted, fontSize: 14, marginTop: 4 }}>+ Add habit</button>
        </>}

        {/* MONTH */}
        {!dataLoading && view === "month" && <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button onClick={prevMonth} style={{ background: "none", border: `0.5px solid ${border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: text, fontSize: 16 }}>‹</button>
            <div style={{ fontWeight: 500, fontSize: 15 }}>{monthName}</div>
            <button onClick={nextMonth} style={{ background: "none", border: `0.5px solid ${border}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: text, fontSize: 16 }}>›</button>
          </div>

          <div className="scrollable-table" style={{ background: card, borderRadius: 12, border: `0.5px solid ${border}`, marginBottom: 16, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "10px 12px", color: muted, fontWeight: 400, fontSize: 12, borderBottom: `0.5px solid ${border}`, position: "sticky", left: 0, background: card, zIndex: 2, minWidth: 120, whiteSpace: "nowrap" }}>Habit</th>
                  {monthDays.map(d => {
                    const dt = new Date(d + "T00:00:00"), isToday = d === today;
                    return (
                      <th key={d} style={{ padding: "6px 3px", minWidth: 26, textAlign: "center", borderBottom: `0.5px solid ${border}`, fontWeight: 400 }}>
                        <div style={{ color: isToday ? "#7F77DD" : muted, fontSize: 9 }}>{DAY_LABELS[dt.getDay()]}</div>
                        <div style={{ color: isToday ? "#7F77DD" : text, fontSize: 10, fontWeight: isToday ? 500 : 400 }}>{dt.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {habits.map((h, hi) => (
                  <tr key={h.id} style={{ borderBottom: `0.5px solid ${border}` }}>
                    <td style={{ padding: "7px 12px", position: "sticky", left: 0, background: hi % 2 === 0 ? card : (dark ? "#262626" : "#fafaf8"), zIndex: 1, maxWidth: 120, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: h.color, flexShrink: 0 }}></div>
                        <span style={{ fontSize: 12, color: text, overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
                      </div>
                    </td>
                    {monthDays.map(d => {
                      const done = !!logs[h.id]?.[d], isFuture = d > today;
                      return (
                        <td key={d} style={{ textAlign: "center", padding: "4px 3px", background: hi % 2 === 0 ? "transparent" : (dark ? "#262626" : "#fafaf8") }}>
                          <button onClick={() => !isFuture && toggleLog(h.id, d)} style={{ width: 17, height: 17, borderRadius: "50%", border: `1.5px solid ${done ? h.color : border}`, background: done ? h.color : "transparent", cursor: isFuture ? "default" : "pointer", opacity: isFuture ? 0.2 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                            {done && <svg width="8" height="8" viewBox="0 0 8 8"><polyline points="1,4 3,6.5 7,1.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: muted, fontWeight: 500, borderTop: `0.5px solid ${border}`, position: "sticky", left: 0, background: card, zIndex: 1, whiteSpace: "nowrap" }}>Daily progress</td>
                  {monthDays.map(d => {
                    const isFuture = d > today, done = habits.filter(h => logs[h.id]?.[d]).length;
                    const pct = habits.length ? Math.round((done / habits.length) * 100) : 0;
                    const barH = 32, fillH = Math.round((pct / 100) * barH);
                    return (
                      <td key={d} style={{ textAlign: "center", padding: "6px 3px", borderTop: `0.5px solid ${border}` }}>
                        <div title={`${pct}%`} style={{ width: 10, height: barH, background: cellBg, borderRadius: 3, display: "inline-flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden", opacity: isFuture ? 0.2 : 1, margin: "0 auto" }}>
                          <div style={{ width: "100%", height: fillH, borderRadius: 3, background: pct === 100 ? "#1D9E75" : pct >= 60 ? "#7F77DD" : pct > 0 ? "#BA7517" : "transparent", transition: "height 0.3s" }}></div>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ background: card, borderRadius: 12, border: `0.5px solid ${border}`, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 12 }}>Each habit — {monthName}</div>
            {habits.length === 0 && <div style={{ textAlign: "center", color: muted, padding: "12px 0", fontSize: 13 }}>No habits to summarize.</div>}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `0.5px solid ${border}` }}>
                  <th style={{ textAlign: "left", padding: "6px 0", color: muted, fontWeight: 400 }}>Habit</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", color: muted, fontWeight: 400 }}>Count</th>
                  <th style={{ textAlign: "right", padding: "6px 0", color: muted, fontWeight: 400 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {habits.map(h => {
                  const count = monthDays.filter(d => logs[h.id]?.[d]).length;
                  const elapsed = monthDays.filter(d => d <= today).length;
                  const pct = elapsed ? Math.round((count / elapsed) * 100) : 0;
                  return (
                    <tr key={h.id} style={{ borderBottom: `0.5px solid ${border}` }}>
                      <td style={{ padding: "9px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: h.color, flexShrink: 0 }}></div>
                          <span style={{ color: text }}>{h.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "center", padding: "9px 8px", color: text }}>{count}</td>
                      <td style={{ padding: "9px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                          <div style={{ width: 60, height: 5, background: cellBg, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: h.color, borderRadius: 3 }}></div>
                          </div>
                          <span style={{ color: muted, fontSize: 12, minWidth: 30, textAlign: "right" }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>}

        {/* AI TIPS */}
        {!dataLoading && view === "ai" && <>
          <div style={{ background: card, borderRadius: 12, border: `0.5px solid ${border}`, padding: "16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 15, marginBottom: 6 }}>AI-powered habit coach</div>
            <div style={{ fontSize: 13, color: muted, marginBottom: 14 }}>Get personalized tips based on your habit data and progress.</div>
            <button onClick={getAiTip} disabled={aiLoading} style={{ background: "#7F77DD", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: aiLoading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 500, opacity: aiLoading ? 0.7 : 1 }}>
              {aiLoading ? "Thinking..." : "Get my tips"}
            </button>
          </div>
          {aiError && <div style={{ color: "#E24B4A", fontSize: 13, marginBottom: 12 }}>{aiError}</div>}
          {aiTip && (
            <div style={{ background: card, borderRadius: 12, border: `0.5px solid #7F77DD`, padding: "16px" }}>
              <div style={{ fontSize: 11, color: "#7F77DD", fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>Your coach says</div>
              <div style={{ fontSize: 14, color: text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiTip}</div>
            </div>
          )}
          {habits.length === 0 && <div style={{ textAlign: "center", color: muted, padding: "20px 0", fontSize: 13 }}>Add some habits first to get AI tips!</div>}
        </>}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }} onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setEditHabit(null); } }}>
          <div style={{ background: card, borderRadius: "16px 16px 0 0", padding: "20px 20px 32px", width: "100%", maxWidth: 600 }}>
            <div style={{ fontWeight: 500, fontSize: 16, marginBottom: 16 }}>{editHabit ? "Edit habit" : "New habit"}</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>Habit name</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Meditate for 10 min" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${border}`, background: inputBg, color: text, fontSize: 14, boxSizing: "border-box" }} onKeyDown={e => e.key === "Enter" && addHabit()} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 4 }}>Daily reminder</div>
              <input type="time" value={newReminder} onChange={e => setNewReminder(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: `0.5px solid ${border}`, background: inputBg, color: text, fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>Color</div>
              <div style={{ display: "flex", gap: 8 }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)} style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: `2.5px solid ${newColor === c ? text : "transparent"}`, cursor: "pointer" }}></button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowAdd(false); setEditHabit(null); }} style={{ flex: 1, padding: "12px", borderRadius: 8, border: `0.5px solid ${border}`, background: "none", color: muted, cursor: "pointer", fontSize: 14 }}>Cancel</button>
              <button onClick={addHabit} style={{ flex: 2, padding: "12px", borderRadius: 8, border: "none", background: "#7F77DD", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>{editHabit ? "Save changes" : "Add habit"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
