import React, { useState, useRef, useEffect, useMemo } from "react";
import { detectMoodAI, MOOD_CONFIG } from "./src/moodDetector";
import { supabase } from "./src/supabaseClient";

const BASE_PROMPT = `You are Tim — a warm, grounded companion and advisor in a chat app.

Voice: talk like a thoughtful close friend, not a customer service bot. Casual, direct,
warm. Short paragraphs. Ask a real follow-up question when it helps, but don't
interrogate — one at a time.

Role: you're here to chat day-to-day, help people think through decisions, and give
honest, useful advice — on work, relationships, plans, random 2am thoughts, whatever
comes up. Be genuinely useful: give real opinions and concrete suggestions rather than
hedging everything into mush. If someone's about to do something risky or is spiraling,
say so gently and directly, the way a good friend would — don't just validate everything.

Boundaries: you're an AI, not a replacement for the people in someone's life or for a
professional (therapist, doctor, lawyer) when the moment calls for one — if it's serious,
say that plainly and encourage them to also lean on real people. Otherwise, no need to
constantly disclaim what you are — just be a good, honest presence in the conversation.`;

const THEMES = {
  dark: {
    bg: "#1B1A2E",
    panel: "#211F38",
    panel2: "#28264A",
    panel3: "#1F1D36",
    border: "rgba(255,255,255,0.08)",
    text: "#F2ECE4",
    textDim: "rgba(242,236,228,0.6)",
    bubbleUser: "#3D3557",
    bubbleAssistant: "rgba(232,162,75,0.12)",
    bubbleAssistantBorder: "rgba(232,162,75,0.3)",
    inputBg: "#1B1A2E",
    accent: "#E0A24B",
    accentText: "#1B1A2E",
    danger: "#E08A8A",
    heroFrom: [250, 45, 22],
    heroTo: [20, 55, 30],
    headerText: "#F2ECE4",
    headerSub: "rgba(242,236,228,0.65)",
    overlay: "rgba(10,9,20,0.6)",
  },
  light: {
    bg: "#F4EFE6",
    panel: "#FBF8F2",
    panel2: "#EFE7D8",
    panel3: "#F7F2E9",
    border: "rgba(40,30,20,0.1)",
    text: "#2A2418",
    textDim: "rgba(42,36,24,0.55)",
    bubbleUser: "#E4DAC4",
    bubbleAssistant: "rgba(199,111,58,0.12)",
    bubbleAssistantBorder: "rgba(199,111,58,0.35)",
    inputBg: "#FBF8F2",
    accent: "#C76F3A",
    accentText: "#FBF8F2",
    danger: "#B4452F",
    heroFrom: [35, 55, 78],
    heroTo: [15, 60, 70],
    headerText: "#2A2418",
    headerSub: "rgba(42,36,24,0.6)",
    overlay: "rgba(30,24,14,0.35)",
  },
};

const MOOD_THEMES = {
  happy: {
    bg: "linear-gradient(135deg, #fff9e6 0%, #ffe8cc 100%)",
    accent: "#e0a52c",
  },
  excited: {
    bg: "linear-gradient(135deg, #e0f7f4 0%, #b3e5e1 100%)",
    accent: "#3fb6a8",
  },
  sad: {
    bg: "linear-gradient(135deg, #e8ecf9 0%, #d4dff5 100%)",
    accent: "#5c7cfa",
  },
  angry: {
    bg: "linear-gradient(135deg, #fde8e6 0%, #f5c9c3 100%)",
    accent: "#c9584f",
  },
  anxious: {
    bg: "linear-gradient(135deg, #f3e9f8 0%, #e6d5f0 100%)",
    accent: "#9b7fd4",
  },
  neutral: {
    bg: "#1B1A2E",
    accent: "#8a8f98",
  },
};

const TONE_OPTIONS = [
  { id: "balanced", label: "Balanced", desc: "Warm but direct — the default." },
  { id: "gentle", label: "Gentle", desc: "Softer, more encouraging." },
  { id: "blunt", label: "Blunt", desc: "Straight to the point, minimal cushioning." },
  { id: "playful", label: "Playful", desc: "Light, casual, more jokes." },
];

function useSystemPrefersDark() {
  const [dark, setDark] = useState(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setDark(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  return dark;
}

function useDusk() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((v) => (v + 1) % 1000), 60);
    return () => clearInterval(id);
  }, []);
  return t;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleFrom(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New chat";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 40 ? t.slice(0, 40) + "…" : t || "New chat";
}

const GREETING = {
  role: "assistant",
  content: "Hey — I'm Tim. Think of me as a friend you can think out loud with. What's going on?",
};

function AuthScreen({ C, initialMode = "sign-in", onRecoveryComplete }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(() => window.localStorage.getItem("tim:last-email") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    window.localStorage.setItem("tim:last-email", email);
    if ((mode === "sign-up" || mode === "reset-password") && password !== confirmPassword) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    const result = mode === "reset-password"
      ? await supabase.auth.updateUser({ password })
      : mode === "reset"
      ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      : mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (result.error) setError(result.error.message);
    else if (mode === "reset-password") {
      window.history.replaceState({}, document.title, window.location.pathname);
      onRecoveryComplete?.();
    } else if (mode === "reset") setError("Password reset instructions were sent to your email.");
    else if (mode === "sign-up" && !result.data.session) setError("Email confirmation is enabled in Supabase.");
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, color: C.text, padding: 20 }}>
      <form onSubmit={submit} style={{ width: "min(100%, 380px)", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
        <h1 style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 32 }}>Tim</h1>
        <p style={{ color: C.textDim, margin: "8px 0 24px" }}>{mode === "sign-in" ? "Welcome back" : mode === "reset-password" ? "Choose a new password" : mode === "reset" ? "Recover your account" : "Create your account"}</p>
        {mode !== "reset-password" && <>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Email</label>
          <input required type="email" autoComplete="email" list="tim-saved-emails" value={email} onChange={(event) => setEmail(event.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 14, padding: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text }} />
          <datalist id="tim-saved-emails"><option value={email} /></datalist>
        </>}
        {mode !== "reset" && <>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>{mode === "reset-password" ? "New password" : "Password"}</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <input required minLength={6} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} style={{ flex: 1, minWidth: 0, padding: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text }} />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: "transparent", color: C.text, padding: "0 10px", cursor: "pointer" }}>{showPassword ? "Hide" : "Show"}</button>
          </div>
          {(mode === "sign-up" || mode === "reset-password") && <>
            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Confirm password</label>
            <input required minLength={6} type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 18, padding: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text }} />
          </>}
        </>}
        {error && <p style={{ color: C.danger, fontSize: 13, lineHeight: 1.4 }}>{error}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", padding: 11, border: 0, borderRadius: 8, background: C.accent, color: C.accentText, fontWeight: 600 }}>{busy ? "Please wait..." : mode === "sign-in" ? "Sign in" : mode === "reset-password" ? "Update password" : mode === "reset" ? "Send reset email" : "Create account"}</button>
        {mode === "sign-in" && <button type="button" onClick={() => { setMode("reset"); setError(null); }} style={{ width: "100%", marginTop: 12, padding: 8, border: 0, background: "transparent", color: C.textDim }}>Forgot password?</button>}
        {mode !== "reset-password" && <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(null); }} style={{ width: "100%", marginTop: 4, padding: 8, border: 0, background: "transparent", color: C.textDim }}>{mode === "sign-in" ? "Need an account? Sign up" : "Back to sign in"}</button>}
      </form>
    </div>
  );
}

const DEFAULT_PERSONALIZATION = { nickname: "", tone: "balanced", customInstructions: "" };
const DEFAULT_PRIVACY = { saveHistory: true };

const storage =
  typeof window !== "undefined" && window.storage
    ? window.storage
    : {
        get: async (key) => {
          const value = window.localStorage.getItem(key);
          return value === null ? null : { value };
        },
        set: async (key, value) => {
          window.localStorage.setItem(key, value);
        },
        delete: async (key) => {
          window.localStorage.removeItem(key);
        },
      };

function IconButton({ onClick, label, children, C }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        background: "rgba(0,0,0,0.15)",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        color: C.text,
        width: 34,
        height: 34,
        cursor: "pointer",
        fontSize: 15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, C }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: checked ? C.accent : C.border,
        position: "relative",
        flexShrink: 0,
        transition: "background 0.15s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s ease",
        }}
      />
    </button>
  );
}

function SettingsModal({
  C,
  theme,
  setThemeChoice,
  themeChoice,
  personalization,
  setPersonalization,
  privacy,
  setPrivacy,
  onClearHistory,
  onSignOut,
  onClose,
}) {
  const [tab, setTab] = useState("general");
  const tabs = [
    { id: "general", label: "General" },
    { id: "personalization", label: "Personalization" },
    { id: "data", label: "Data controls" },
    { id: "about", label: "About" },
  ];

  const labelStyle = {
    fontSize: 12.5,
    color: C.textDim,
    fontWeight: 500,
    marginBottom: 6,
    display: "block",
  };
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 0",
    borderBottom: `1px solid ${C.border}`,
    gap: 16,
  };
  const inputStyle = {
    width: "100%",
    background: C.panel3,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    padding: "8px 10px",
    fontSize: 14,
    fontFamily: "inherit",
  };
  const selectStyle = {
    ...inputStyle,
    width: 160,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: C.overlay,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 680,
          height: 520,
          maxHeight: "88vh",
          background: C.panel,
          borderRadius: 14,
          border: `1px solid ${C.border}`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* Left nav */}
        <div
          style={{
            width: 190,
            flexShrink: 0,
            background: C.panel2,
            borderRight: `1px solid ${C.border}`,
            padding: "16px 10px",
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 17,
              fontWeight: 600,
              color: C.headerText,
              padding: "0 8px 14px",
            }}
          >
            Settings
          </div>
          {tabs.map((tItem) => (
            <button
              key={tItem.id}
              onClick={() => setTab(tItem.id)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                marginBottom: 2,
                background: tab === tItem.id ? C.bubbleAssistant : "transparent",
                color: tab === tItem.id ? C.text : C.textDim,
                fontSize: 13.5,
                fontWeight: tab === tItem.id ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {tItem.label}
            </button>
          ))}
        </div>

        {/* Right content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "12px 16px 0",
            }}
          >
            <button
              onClick={onClose}
              aria-label="Close settings"
              style={{
                background: "transparent",
                border: "none",
                color: C.textDim,
                fontSize: 18,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 24px" }}>
            {tab === "general" && (
              <div>
                <div style={rowStyle}>
                  <div>
                    <div style={{ color: C.text, fontSize: 14.5 }}>Theme</div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      Choose how Tim looks on this device.
                    </div>
                  </div>
                  <select
                    value={themeChoice}
                    onChange={(e) => setThemeChoice(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div style={{ ...rowStyle, borderBottom: "none" }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 14.5 }}>Active theme</div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      Currently rendering in {theme} mode.
                    </div>
                  </div>
                </div>
                <div style={{ ...rowStyle, borderBottom: "none" }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 14.5 }}>Account</div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      Sign out of this Tim account.
                    </div>
                  </div>
                  <button
                    onClick={onSignOut}
                    style={{
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      background: "transparent",
                      color: C.text,
                      padding: "8px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}

            {tab === "personalization" && (
              <div>
                <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <label style={labelStyle}>What should Tim call you?</label>
                  <input
                    style={inputStyle}
                    value={personalization.nickname}
                    onChange={(e) =>
                      setPersonalization({ ...personalization, nickname: e.target.value })
                    }
                    placeholder="Your name or nickname"
                  />
                </div>
                <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <label style={labelStyle}>Tone</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {TONE_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: personalization.tone === opt.id ? C.bubbleAssistant : "transparent",
                          border: `1px solid ${
                            personalization.tone === opt.id ? C.bubbleAssistantBorder : "transparent"
                          }`,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="tone"
                          checked={personalization.tone === opt.id}
                          onChange={() => setPersonalization({ ...personalization, tone: opt.id })}
                          style={{ marginTop: 3 }}
                        />
                        <div>
                          <div style={{ color: C.text, fontSize: 14 }}>{opt.label}</div>
                          <div style={{ color: C.textDim, fontSize: 12.5 }}>{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "14px 0" }}>
                  <label style={labelStyle}>Anything else Tim should know?</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                    value={personalization.customInstructions}
                    onChange={(e) =>
                      setPersonalization({ ...personalization, customInstructions: e.target.value })
                    }
                    placeholder="e.g. I'm a night-shift nurse, keep advice short, I'm working on my startup…"
                  />
                </div>
              </div>
            )}

            {tab === "data" && (
              <div>
                <div style={rowStyle}>
                  <div>
                    <div style={{ color: C.text, fontSize: 14.5 }}>Save chat history</div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      When off, new chats won't be saved to this device.
                    </div>
                  </div>
                  <Toggle
                    checked={privacy.saveHistory}
                    onChange={(v) => setPrivacy({ ...privacy, saveHistory: v })}
                    C={C}
                  />
                </div>
                <div style={{ ...rowStyle, borderBottom: "none" }}>
                  <div>
                    <div style={{ color: C.text, fontSize: 14.5 }}>Clear all chats</div>
                    <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                      Permanently deletes every saved conversation.
                    </div>
                  </div>
                  <button
                    onClick={onClearHistory}
                    style={{
                      background: "transparent",
                      border: `1px solid ${C.danger}`,
                      color: C.danger,
                      borderRadius: 8,
                      padding: "7px 12px",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}

            {tab === "about" && (
              <div style={{ paddingTop: 14, color: C.textDim, fontSize: 13.5, lineHeight: 1.6 }}>
                <div style={{ color: C.text, fontSize: 14.5, marginBottom: 6 }}>Tim</div>
                A friend to think out loud with. Tim gives honest opinions and remembers
                your chats on this device — it isn't a replacement for the people or
                professionals in your life.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TimChat() {
  const [themeChoice, setThemeChoice] = useState("dark"); // "system" | "light" | "dark"
  const systemPrefersDark = useSystemPrefersDark();
  const theme = themeChoice === "system" ? (systemPrefersDark ? "dark" : "light") : themeChoice;

  const [ready, setReady] = useState(false);
  const [convIndex, setConvIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [personalization, setPersonalization] = useState(DEFAULT_PERSONALIZATION);
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY);
  const [detectedMood, setDetectedMood] = useState("neutral");
  const [moodConfidence, setMoodConfidence] = useState(0);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const scrollRef = useRef(null);
  const t = useDusk();
  const C = THEMES[theme];

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUser(data.session?.user || null);
        setRecoveryMode(new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery");
        setAuthLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const systemPrompt = useMemo(() => {
    let p = BASE_PROMPT;
    const extra = [];
    if (personalization.nickname) extra.push(`Call the person "${personalization.nickname}".`);
    const toneMap = {
      gentle: "Lean gentle and encouraging in tone.",
      blunt: "Lean blunt and to-the-point, minimal cushioning.",
      playful: "Lean light, casual, and a bit playful.",
      balanced: "",
    };
    if (toneMap[personalization.tone]) extra.push(toneMap[personalization.tone]);
    if (personalization.customInstructions)
      extra.push(`Extra context from the user: ${personalization.customInstructions}`);
    if (extra.length) p += `\n\nPersonalization:\n` + extra.join("\n");
    return p;
  }, [personalization]);

  useEffect(() => {
    (async () => {
      try {
        const s = await storage.get("tim:settings", false);
        if (s?.value) {
          const parsed = JSON.parse(s.value);
          if (parsed.themeChoice) setThemeChoice(parsed.themeChoice);
        }
      } catch (e) {}
      try {
        const p = await storage.get("tim:personalization", false);
        if (p?.value) setPersonalization({ ...DEFAULT_PERSONALIZATION, ...JSON.parse(p.value) });
      } catch (e) {}
      try {
        const pr = await storage.get("tim:privacy", false);
        if (pr?.value) setPrivacy({ ...DEFAULT_PRIVACY, ...JSON.parse(pr.value) });
      } catch (e) {}
      try {
        const idx = await storage.get("tim:conversations", false);
        if (idx?.value) {
          const list = JSON.parse(idx.value);
          setConvIndex(list);
          if (list.length > 0) await loadConversation(list[0].id);
        }
      } catch (e) {}
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (!ready) return;
    storage.set("tim:settings", JSON.stringify({ themeChoice }), false).catch(() => {});
  }, [themeChoice, ready]);

  useEffect(() => {
    if (!ready) return;
    storage
      .set("tim:personalization", JSON.stringify(personalization), false)
      .catch(() => {});
  }, [personalization, ready]);

  useEffect(() => {
    if (!ready) return;
    storage.set("tim:privacy", JSON.stringify(privacy), false).catch(() => {});
  }, [privacy, ready]);

  async function saveConvIndex(list) {
    setConvIndex(list);
    try {
      await storage.set("tim:conversations", JSON.stringify(list), false);
    } catch (e) {}
  }

  async function loadConversation(id) {
    try {
      const res = await storage.get(`tim:conv:${id}`, false);
      if (res?.value) {
        const data = JSON.parse(res.value);
        setActiveId(id);
        setMessages(data.messages?.length ? data.messages : [GREETING]);
        setError(null);
      }
    } catch (e) {
      setError("Couldn't load that conversation.");
    }
  }

  async function persistConversation(id, msgs) {
    try {
      await storage.set(
        `tim:conv:${id}`,
        JSON.stringify({ id, messages: msgs, updatedAt: Date.now() }),
        false
      );
    } catch (e) {}
  }

  function startNewChat() {
    setActiveId(null);
    setMessages([GREETING]);
    setError(null);
    setSidebarOpen(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSettingsOpen(false);
  }

  async function deleteConversation(id, ev) {
    ev.stopPropagation();
    try {
      await storage.delete(`tim:conv:${id}`, false);
    } catch (e) {}
    const next = convIndex.filter((c) => c.id !== id);
    await saveConvIndex(next);
    if (activeId === id) startNewChat();
  }

  async function clearAllHistory() {
    for (const c of convIndex) {
      try {
        await storage.delete(`tim:conv:${c.id}`, false);
      } catch (e) {}
    }
    await saveConvIndex([]);
    startNewChat();
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    // Run mood detection alongside the reply request so it does not delay the response.
    detectMoodAI(text, messages).then(({ mood, confidence }) => {
      setDetectedMood(mood);
      setMoodConfidence(confidence);
    });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await response.json();
      const reply = data?.content?.find((b) => b.type === "text")?.text;
      if (!reply) throw new Error("No reply returned");
      const finalMessages = [...nextMessages, { role: "assistant", content: reply }];
      setMessages(finalMessages);

      if (privacy.saveHistory) {
        let id = activeId;
        let list = convIndex;
        if (!id) {
          id = newId();
          setActiveId(id);
          list = [{ id, title: titleFrom(finalMessages), updatedAt: Date.now() }, ...convIndex];
        } else {
          list = convIndex.map((c) =>
            c.id === id ? { ...c, title: titleFrom(finalMessages), updatedAt: Date.now() } : c
          );
          list = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
        }
        await saveConvIndex(list);
        await persistConversation(id, finalMessages);
      }
    } catch (e) {
      setError("Tim didn't catch that — try sending it again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const hue1 = C.heroFrom[0] + 10 * Math.sin(t / 60);
  const hue2 = C.heroTo[0] + 8 * Math.sin(t / 45 + 1.3);

  if (authLoading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: C.bg, color: C.text }}>Loading...</div>;
  }
  if (recoveryMode) return <AuthScreen C={C} initialMode="reset-password" onRecoveryComplete={() => setRecoveryMode(false)} />;
  if (!user) return <AuthScreen C={C} />;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        background: MOOD_THEMES[detectedMood]?.bg || MOOD_THEMES.neutral.bg,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        transition: "background 900ms ease",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        textarea:focus, button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          * { transition: none !important; animation: none !important; }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: 960,
          minHeight: "100vh",
          display: "flex",
          background: C.panel,
          boxShadow: "0 0 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Sidebar */}
        <div
          style={{
            width: sidebarOpen ? 240 : 0,
            flexShrink: 0,
            overflow: "hidden",
            borderRight: sidebarOpen ? `1px solid ${C.border}` : "none",
            background: C.panel2,
            transition: "width 0.2s ease",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: 14 }}>
            <button
              onClick={startNewChat}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.text,
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              + New chat
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
            {convIndex.length === 0 && (
              <div style={{ color: C.textDim, fontSize: 13, padding: "8px 8px" }}>
                No conversations yet.
              </div>
            )}
            {convIndex.map((c) => (
              <div
                key={c.id}
                onClick={() => loadConversation(c.id)}
                style={{
                  padding: "10px 10px",
                  borderRadius: 8,
                  marginBottom: 4,
                  cursor: "pointer",
                  background: c.id === activeId ? C.bubbleAssistant : "transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    color: C.text,
                    fontSize: 13.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.title}
                </span>
                <button
                  onClick={(ev) => deleteConversation(c.id, ev)}
                  aria-label="Delete conversation"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: C.textDim,
                    cursor: "pointer",
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ padding: 10, borderTop: `1px solid ${C.border}` }}>
            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: C.text,
                fontSize: 13.5,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              ⚙ Settings
            </button>
          </div>
        </div>

        {/* Main column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Dusk header */}
          <div
            style={{
              position: "relative",
              padding: "20px 20px 18px",
              overflow: "hidden",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(120deg, hsl(${hue1},${C.heroFrom[1]}%,${C.heroFrom[2]}%), hsl(${hue2},${C.heroTo[1]}%,${C.heroTo[2]}%) 60%, ${C.bg})`,
                opacity: theme === "dark" ? 0.9 : 0.5,
              }}
            />
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <IconButton onClick={() => setSidebarOpen((v) => !v)} label="Toggle history" C={C}>
                  ☰
                </IconButton>
                <div>
                  <h1
                    style={{
                      margin: 0,
                      fontFamily: "Fraunces, serif",
                      fontWeight: 600,
                      fontSize: 26,
                      color: C.headerText,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    Tim
                  </h1>
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 12.5,
                      color: C.headerSub,
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    I am your Mate
                  </p>
                </div>
              </div>

              <IconButton onClick={() => setSettingsOpen(true)} label="Settings" C={C}>
                ⚙
              </IconButton>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {!ready && <div style={{ color: C.textDim, fontSize: 13 }}>Loading…</div>}
            {ready &&
              messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    background: m.role === "user" ? C.bubbleUser : C.bubbleAssistant,
                    border:
                      m.role === "user"
                        ? `1px solid ${C.border}`
                        : `1px solid ${C.bubbleAssistantBorder}`,
                    color: C.text,
                    padding: "10px 14px",
                    borderRadius:
                      m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    fontSize: 15,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                </div>
              ))}
            {loading && (
              <div
                style={{
                  alignSelf: "flex-start",
                  color: C.textDim,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 13,
                  padding: "4px 4px",
                }}
              >
                Tim is typing…
              </div>
            )}
            {error && (
              <div style={{ color: C.danger, fontSize: 13, alignSelf: "flex-start" }}>
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: 16,
              borderTop: `1px solid ${C.border}`,
              background: C.panel,
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Tell Tim what's on your mind…"
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                background: C.inputBg,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                padding: "10px 12px",
                fontSize: 15,
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: C.accent,
                color: C.accentText,
                border: "none",
                borderRadius: 10,
                padding: "0 18px",
                fontWeight: 600,
                fontSize: 14,
                cursor: loading || !input.trim() ? "default" : "pointer",
                opacity: loading || !input.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <SettingsModal
          C={C}
          theme={theme}
          themeChoice={themeChoice}
          setThemeChoice={setThemeChoice}
          personalization={personalization}
          setPersonalization={setPersonalization}
          privacy={privacy}
          setPrivacy={setPrivacy}
          onClearHistory={clearAllHistory}
          onSignOut={signOut}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}