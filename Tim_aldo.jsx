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
    bg: "#070B12",
    panel: "#0E1520",
    panel2: "#101A28",
    panel3: "#162230",
    border: "rgba(255,255,255,0.08)",
    text: "#F6F1E8",
    textDim: "rgba(246,241,232,0.7)",
    bubbleUser: "#3B4C77",
    bubbleAssistant: "rgba(255,180,84,0.18)",
    bubbleAssistantBorder: "rgba(255,180,84,0.4)",
    inputBg: "#121D2A",
    accent: "#FFB454",
    accentText: "#111827",
    danger: "#FF7A7A",
    heroFrom: [18, 80, 68],
    heroTo: [220, 72, 55],
    headerText: "#F6F1E8",
    headerSub: "rgba(246,241,232,0.72)",
    overlay: "rgba(4,7,12,0.7)",
  },
  light: {
    bg: "#F7F3EE",
    panel: "#FFFDF9",
    panel2: "#F2E7DA",
    panel3: "#F8F1E7",
    border: "rgba(70,50,30,0.12)",
    text: "#2A210F",
    textDim: "rgba(42,33,15,0.64)",
    bubbleUser: "#E7D6B1",
    bubbleAssistant: "rgba(217,119,6,0.12)",
    bubbleAssistantBorder: "rgba(217,119,6,0.34)",
    inputBg: "#FFF9F3",
    accent: "#D97706",
    accentText: "#FFFDF9",
    danger: "#C94B3D",
    heroFrom: [38, 88, 70],
    heroTo: [28, 60, 80],
    headerText: "#2A210F",
    headerSub: "rgba(42,33,15,0.7)",
    overlay: "rgba(30,22,12,0.28)",
  },
};

const MOOD_COLORS = {
  happy: {
    boxBg: "#e0a52c",
    textColor: "#1B1A2E",
    lightBg: "rgba(224, 165, 44, 0.15)",
  },
  excited: {
    boxBg: "#3fb6a8",
    textColor: "#FFFFFF",
    lightBg: "rgba(63, 182, 168, 0.15)",
  },
  sad: {
    boxBg: "#5c7cfa",
    textColor: "#FFFFFF",
    lightBg: "rgba(92, 124, 250, 0.15)",
  },
  angry: {
    boxBg: "#c9584f",
    textColor: "#FFFFFF",
    lightBg: "rgba(201, 88, 79, 0.15)",
  },
  anxious: {
    boxBg: "#9b7fd4",
    textColor: "#FFFFFF",
    lightBg: "rgba(155, 127, 212, 0.15)",
  },
  neutral: {
    boxBg: "#6B7280",
    textColor: "#FFFFFF",
    lightBg: "rgba(107, 114, 128, 0.15)",
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
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: `radial-gradient(circle at 15% 10%, ${C.bubbleAssistant}, transparent 34%), radial-gradient(circle at 90% 85%, ${C.bubbleAssistant}, transparent 28%), ${C.bg}`, color: C.text, padding: 20 }}>
      <form onSubmit={submit} style={{ position: "relative", overflow: "hidden", width: "min(100%, 380px)", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 30, boxShadow: "0 24px 70px rgba(0,0,0,0.28)" }}>
        <div aria-hidden style={{ height: 4, position: "absolute", top: 0, left: 0, right: 0, background: C.accent }} />
        <div style={{ color: C.accent, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>A private space to think</div>
        <h1 style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 36, letterSpacing: "0.01em" }}>Tim</h1>
        <p style={{ color: C.textDim, margin: "8px 0 26px" }}>{mode === "sign-in" ? "Welcome back" : mode === "reset-password" ? "Choose a new password" : mode === "reset" ? "Recover your account" : "Create your account"}</p>
        {mode !== "reset-password" && <>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>Email</label>
          <input required type="email" autoComplete="email" list="tim-saved-emails" value={email} onChange={(event) => setEmail(event.target.value)} style={{ width: "100%", boxSizing: "border-box", marginBottom: 14, padding: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, outlineColor: C.accent }} />
          <datalist id="tim-saved-emails"><option value={email} /></datalist>
        </>}
        {mode !== "reset" && <>
          <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>{mode === "reset-password" ? "New password" : "Password"}</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <input required minLength={6} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} style={{ flex: 1, minWidth: 0, padding: 11, borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, outlineColor: C.accent }} />
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
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        color: C.text,
        width: 36,
        height: 36,
        cursor: "pointer",
        fontSize: 15,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
        backdropFilter: "blur(8px)",
        transition: "transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.borderColor = C.bubbleAssistantBorder;
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        e.currentTarget.style.boxShadow = "0 12px 20px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        e.currentTarget.style.boxShadow = "0 8px 18px rgba(0,0,0,0.08)";
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
  userEmail,
  onClose,
}) {
  const [tab, setTab] = useState("general");
  const tabs = [
    { id: "account", label: "Account" },
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
              </div>
            )}

            {tab === "account" && (
              <div>
                <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ color: C.text, fontSize: 14.5 }}>Signed-in email</div>
                  <div style={{ color: C.textDim, fontSize: 13, marginTop: 5, wordBreak: "break-word" }}>
                    {userEmail}
                  </div>
                </div>
                <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ color: C.text, fontSize: 14.5 }}>Password</div>
                  <div style={{ color: C.textDim, fontSize: 12.5, marginTop: 2 }}>
                    Use Forgot password on the sign-in screen to change it.
                  </div>
                </div>
                <div style={{ padding: "14px 0" }}>
                  <button
                    onClick={onSignOut}
                    style={{
                      border: `1px solid ${C.danger}`,
                      borderRadius: 8,
                      background: "transparent",
                      color: C.danger,
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
  const [detectedMood, setDetectedMood] = useState("happy");
  const [moodConfidence, setMoodConfidence] = useState(0);
  const [lastMoodDetectedTime, setLastMoodDetectedTime] = useState(0);
  const [moodTimeout, setMoodTimeout] = useState(null);
  const [moodTimeRemaining, setMoodTimeRemaining] = useState(0);
  const [moodPhase, setMoodPhase] = useState("detect"); // "detect" (7 min) or "hold" (10 min)
  const DETECT_DURATION_MS = 7 * 60 * 1000; // 7 minutes for detection phase
  const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes for holding color
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const scrollRef = useRef(null);
  const t = useDusk();
  const moodColor = MOOD_COLORS[detectedMood] || MOOD_COLORS.neutral;
  const C = { ...THEMES[theme] };

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

  // Cleanup mood timeout on unmount
  useEffect(() => {
    return () => {
      if (moodTimeout) clearTimeout(moodTimeout);
    };
  }, [moodTimeout]);

  // Update mood timer display every second
  useEffect(() => {
    const timerInterval = setInterval(() => {
      if (lastMoodDetectedTime > 0) {
        const elapsed = Date.now() - lastMoodDetectedTime;
        const currentDuration = moodPhase === "hold" ? HOLD_DURATION_MS : DETECT_DURATION_MS;
        const remaining = Math.max(0, currentDuration - elapsed);
        setMoodTimeRemaining(remaining);
      }
    }, 1000);
    
    return () => clearInterval(timerInterval);
  }, [lastMoodDetectedTime, moodPhase]);

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

  async function shareChat() {
    const transcript = messages
      .map((message) => `${message.role === "user" ? "You" : "Tim"}: ${message.content}`)
      .join("\n\n");
    const shareData = {
      title: "Tim",
      text: transcript,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus("Shared");
      } else {
        await navigator.clipboard.writeText(transcript);
        setShareStatus("Chat copied");
      }
    } catch (shareError) {
      if (shareError.name !== "AbortError") setShareStatus("Couldn't share");
    }
    window.setTimeout(() => setShareStatus(""), 2200);
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

  async function renameConversation(id, newTitle) {
    const updated = convIndex.map((c) =>
      c.id === id ? { ...c, title: newTitle, updatedAt: Date.now() } : c
    );
    await saveConvIndex(updated);
  }

  function openRenameDialog() {
    if (activeId) {
      const current = convIndex.find((c) => c.id === activeId);
      setNewChatName(current?.title || "New chat");
      setRenameDialogOpen(true);
      setChatMenuOpen(false);
    }
  }

  async function submitRename() {
    const trimmed = newChatName.trim();
    if (activeId && trimmed) {
      await renameConversation(activeId, trimmed);
      setRenameDialogOpen(false);
      setNewChatName("");
    }
  }

  function deleteCurrentChat() {
    if (activeId) {
      setDeleteConfirmOpen(true);
      setChatMenuOpen(false);
    }
  }

  async function confirmDeleteCurrentChat() {
    if (!activeId) return;
    await deleteConversation(activeId, { stopPropagation: () => {} });
    setDeleteConfirmOpen(false);
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
      const now = Date.now();
      
      // Only update mood if we're in detect phase OR if it's the first detection
      if (moodPhase === "detect" || lastMoodDetectedTime === 0) {
        setDetectedMood(mood);
        setMoodConfidence(confidence);
        setLastMoodDetectedTime(now);
        setMoodPhase("hold"); // Switch to hold phase after detection
        
        // Clear previous timeout if any
        if (moodTimeout) clearTimeout(moodTimeout);
        
        // After 10 minutes in hold phase, switch back to detect phase
        const timeout = setTimeout(() => {
          setMoodPhase("detect");
          setLastMoodDetectedTime(0);
        }, HOLD_DURATION_MS);
        setMoodTimeout(timeout);
      }
      // If in hold phase, don't update mood - just ignore the detection
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
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Limit reached for today.");
        }
        throw new Error(data?.error?.message || "The chat service is temporarily unavailable.");
      }
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
      setError(e.message || "Tim didn't catch that — try sending it again.");
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
        background: C.bg,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap');
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; min-height: 100%; background: ${C.bg}; }
        body {
          background:
            radial-gradient(circle at top left, rgba(255,180,84,0.12), transparent 24%),
            radial-gradient(circle at bottom right, rgba(59,76,119,0.14), transparent 30%),
            ${C.bg};
        }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
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
          background: "rgba(255,255,255,0.02)",
          backdropFilter: "blur(16px)",
          border: `1px solid ${C.border}`,
          boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
          position: "relative",
          overflow: "hidden",
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
                padding: "11px 12px",
                borderRadius: 12,
                border: `1px solid ${C.bubbleAssistantBorder}`,
                background: `linear-gradient(135deg, ${C.accent} 0%, ${C.bubbleAssistant} 100%)`,
                color: C.accentText,
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
                boxShadow: "0 12px 24px rgba(0,0,0,0.12)",
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
                  borderRadius: 12,
                  marginBottom: 4,
                  cursor: "pointer",
                  background: c.id === activeId ? `linear-gradient(135deg, ${C.bubbleAssistant} 0%, rgba(255,255,255,0.02) 100%)` : "transparent",
                  border: c.id === activeId ? `1px solid ${C.bubbleAssistantBorder}` : "1px solid transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                }}
              >
                <span
                  style={{
                    color: C.text,
                    fontSize: 13.5,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: c.id === activeId ? 600 : 500,
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
                    opacity: 0.8,
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        border: `1px solid ${C.border}`,
                        color: C.headerSub,
                        fontSize: 11,
                        fontFamily: "'IBM Plex Mono', monospace",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      <span>{MOOD_CONFIG[detectedMood]?.icon}</span>
                      <span>{MOOD_CONFIG[detectedMood]?.label}</span>
                      {moodConfidence > 0 && <span>({Math.round(moodConfidence * 100)}%)</span>}
                    </span>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 12.5,
                        color: C.headerSub,
                        fontFamily: "'IBM Plex Mono', monospace",
                      }}
                    >
                      I am your Mate
                    </p>
                    {lastMoodDetectedTime > 0 && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "4px 8px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.06)",
                          border: `1px solid ${C.border}`,
                          color: C.headerSub,
                          fontSize: 11,
                        }}
                      >
                        <span>{moodPhase === "detect" ? "🔍" : "🎨"}</span>
                        <span>{Math.floor(moodTimeRemaining / 60000)}:{(Math.floor((moodTimeRemaining % 60000) / 1000)).toString().padStart(2, '0')}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {shareStatus && <span style={{ color: C.headerSub, fontSize: 12 }}>{shareStatus}</span>}
                <IconButton onClick={shareChat} label="Share chat" C={C}>
                  ↗
                </IconButton>
                <IconButton onClick={startNewChat} label="Refresh chat" C={C}>
                  ↻
                </IconButton>
                <div style={{ position: "relative" }}>
                  <IconButton onClick={() => setChatMenuOpen(!chatMenuOpen)} label="Chat options" C={C}>
                    ⋯
                  </IconButton>
                  {chatMenuOpen && activeId && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 4,
                        background: C.panel,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        overflow: "hidden",
                        zIndex: 10,
                        minWidth: 160,
                      }}
                    >
                      <button
                        onClick={openRenameDialog}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          color: C.text,
                          textAlign: "left",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Rename chat
                      </button>
                      <button
                        onClick={deleteCurrentChat}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "none",
                          background: "transparent",
                          color: C.danger,
                          textAlign: "left",
                          fontSize: 13,
                          cursor: "pointer",
                          borderTop: `1px solid ${C.border}`,
                        }}
                      >
                        Delete chat
                      </button>
                    </div>
                  )}
                </div>
                <IconButton onClick={() => setSettingsOpen(true)} label="Settings" C={C}>
                  ⚙
                </IconButton>
              </div>
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                  style={{
                    alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "82%",
                    background: m.role === "user" ? moodColor.boxBg : moodColor.lightBg,
                    border: `1px solid ${m.role === "user" ? moodColor.boxBg : C.border}`,
                    color: m.role === "user" ? moodColor.textColor : C.text,
                    padding: "12px 14px",
                    borderRadius:
                      m.role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                    fontSize: 15,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.08)",
                    transition: "background 300ms ease, color 300ms ease, border 300ms ease, transform 200ms ease",
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
                background: `linear-gradient(135deg, ${moodColor.boxBg} 0%, rgba(255,255,255,0.04) 100%)`,
                border: `2px solid ${moodColor.boxBg}`,
                borderRadius: 14,
                color: moodColor.textColor,
                padding: "12px 14px",
                fontSize: 15,
                fontFamily: "inherit",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 24px rgba(0,0,0,0.08)",
                transition: "background 300ms ease, color 300ms ease, transform 200ms ease",
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: `linear-gradient(135deg, ${moodColor.boxBg} 0%, ${moodColor.lightBg.replace("0.15", "0.28")} 100%)`,
                color: moodColor.textColor,
                border: `1px solid ${moodColor.boxBg}`,
                borderRadius: 14,
                padding: "0 18px",
                fontWeight: 700,
                fontSize: 14,
                cursor: loading || !input.trim() ? "default" : "pointer",
                opacity: loading || !input.trim() ? 0.6 : 1,
                boxShadow: "0 12px 20px rgba(0,0,0,0.1)",
                transition: "transform 200ms ease, opacity 200ms ease, box-shadow 200ms ease",
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {renameDialogOpen && (
        <div
          onClick={() => setRenameDialogOpen(false)}
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
              maxWidth: 400,
              background: C.panel,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              padding: 24,
            }}
          >
            <h2 style={{ margin: "0 0 16px", fontSize: 18, color: C.text }}>Rename chat</h2>
            <input
              autoFocus
              type="text"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setRenameDialogOpen(false);
              }}
              placeholder="Enter new chat name..."
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: 10,
                marginBottom: 16,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.inputBg,
                color: C.text,
                fontSize: 14,
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setRenameDialogOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.text,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={submitRename}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: C.accent,
                  color: C.accentText,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div
          onClick={() => setDeleteConfirmOpen(false)}
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
              maxWidth: 420,
              background: C.panel,
              borderRadius: 14,
              border: `1px solid ${C.border}`,
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              padding: 24,
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 20, color: C.text }}>Delete this chat?</h2>
            <p style={{ margin: "0 0 20px", color: C.textDim, lineHeight: 1.5, fontSize: 14 }}>
              This will permanently remove the current conversation from this device. You can’t undo it.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.text,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCurrentChat}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: C.danger,
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Delete chat
              </button>
            </div>
          </div>
        </div>
      )}

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
          userEmail={user.email}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}