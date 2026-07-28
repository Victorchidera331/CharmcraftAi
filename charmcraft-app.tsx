"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { dailyInsights, pickupLibraries, replySet, selectLibraryItem, starterLibraries, statusLibraries, type PickupCategory, type StarterCategory, type StatusCategory } from "@/lib/charm-content";
import { buildOfflineCoachReply, createEmptyMemory, normalizeCoachMemory, updateCoachMemory, type CoachMemory, type CoachTopic } from "@/lib/coach-engine";

type ScreenId =
  | "splash"
  | "welcome"
  | "signin"
  | "signup"
  | "forgot"
  | "guest"
  | "home"
  | "reply"
  | "analyzer"
  | "pickup"
  | "starter"
  | "status"
  | "score"
  | "insights"
  | "practice"
  | "achievements"
  | "account"
  | "premium";

type StoredUser = {
  name: string;
  email: string;
  guest?: boolean;
  xp: number;
  streak: number;
  level: number;
  premium?: boolean;
};

type Mission = {
  id: string;
  label: string;
  xp: number;
  done: boolean;
};

type ChatMessage = {
  role: "user" | "coach" | "practice";
  text: string;
  time: string;
};

type GeneratedContent = {
  id: string;
  text: string;
  kind: "reply" | "pickup" | "starter" | "status" | "insight" | "analysis" | "coach";
  label?: string;
};

type AppSettings = {
  theme: string;
  language: string;
  notifications: boolean;
  sync: boolean;
  voiceRate: number;
};

type VoiceTarget = "reply" | "analyzer" | "coach" | "practice";

type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = { results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type ModuleRecord = {
  name: string;
  ready: boolean;
  error?: string;
};

type ConfigStore = Record<string, string | number | boolean | string[]>;

const storageKeys = {
  user: "charmcraft.user",
  settings: "charmcraft.settings",
  missions: "charmcraft.missions",
  favorites: "charmcraft.favoriteInsights",
  savedItems: "charmcraft.savedItems",
  favoriteItems: "charmcraft.favoriteItems",
  coach: "charmcraft.coachThread",
  coachMemory: "charmcraft.coachMemory",
  modules: "charmcraft.modules",
};

const defaultSettings: AppSettings = { theme: "Dark", language: "English", notifications: true, sync: false, voiceRate: 1 };

const screens: ScreenId[] = [
  "splash",
  "welcome",
  "signin",
  "signup",
  "forgot",
  "guest",
  "home",
  "reply",
  "analyzer",
  "pickup",
  "starter",
  "status",
  "score",
  "insights",
  "practice",
  "achievements",
  "account",
  "premium",
];

const quickTools: Array<{ id: ScreenId; icon: string; title: string; desc: string }> = [
  { id: "reply", icon: "💬", title: "Reply Assistant", desc: "Craft confident replies" },
  { id: "analyzer", icon: "🔎", title: "Chat Analyzer", desc: "Decode signals fast" },
  { id: "pickup", icon: "✨", title: "Pickup Lines", desc: "Funny, bold, cute" },
  { id: "starter", icon: "🚀", title: "Conversation Starter", desc: "Open any chat" },
  { id: "status", icon: "🎭", title: "Status Studio", desc: "Captions and quotes" },
  { id: "score", icon: "🏆", title: "Charm Score", desc: "Measure your style" },
  { id: "insights", icon: "💡", title: "Insights", desc: "Daily coaching tips" },
  { id: "practice", icon: "🎯", title: "Practice", desc: "Chat with AI roles" },
  { id: "achievements", icon: "🎖️", title: "Achievements", desc: "XP, streaks, badges" },
  { id: "account", icon: "⚙️", title: "Account", desc: "Profile and sync" },
];

const defaultMissions: Mission[] = [
  { id: "m1", label: "Send one warm opener", xp: 20, done: false },
  { id: "m2", label: "Practice confident texting", xp: 30, done: false },
  { id: "m3", label: "Save one favorite insight", xp: 15, done: false },
];

const categories = {
  pickup: ["Funny", "Romantic", "Cute", "Bold", "Smooth", "First Message", "Ice Breaker"] as PickupCategory[],
  starter: ["Friends", "Dating", "Crush", "WhatsApp", "Instagram", "Facebook", "Random"] as StarterCategory[],
  status: ["WhatsApp Status", "Facebook Caption", "Instagram Caption", "TikTok Caption", "Motivational Quotes", "Love Quotes", "Funny Status", "Friendship Status", "Success Quotes"] as StatusCategory[],
  practice: ["Beginner", "Intermediate", "Advanced", "Flirting Mode", "Professional Mode"],
};

const ConfigService = (() => {
  let store: ConfigStore = {
    aiTone: "warm-confident",
    dailyXpGoal: 75,
    offlineMode: true,
    appVersion: "1.0.0",
    premiumFeatures: ["Unlimited AI tools", "Advanced Coach Victor", "Cloud Sync", "Premium Badge"],
  };

  return {
    get<T extends ConfigStore[keyof ConfigStore]>(key: string, fallback?: T): T | ConfigStore[keyof ConfigStore] | undefined {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback;
    },
    set(key: string, value: ConfigStore[keyof ConfigStore]) {
      store = { ...store, [key]: value };
      return store[key];
    },
    getAll() {
      return { ...store };
    },
  };
})();

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(error);
  }
}

function nowTime() {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function scoreFromText(text: string, salt = 0) {
  const clean = text.trim();
  const words = clean ? clean.split(/\s+/).length : 0;
  const punctuation = (clean.match(/[!?]/g) ?? []).length;
  return Math.max(35, Math.min(98, 48 + words * 2 + punctuation * 3 + salt));
}

function analyzeChat(text: string, variation = 0) {
  const base = scoreFromText(text, 4 + (variation % 5));
  const suggestions = [
    "Ask one specific follow-up that proves you listened",
    "Match their message length before raising the energy",
    "Use a warm statement before a new question",
    "Share one short detail about yourself to balance the exchange",
    "Turn the chat toward a simple plan when the energy is good",
    "Let a delayed reply breathe instead of sending a second message",
    "Name what you enjoyed in their message, then invite more detail",
    "Choose clarity over trying to sound perfectly clever",
  ];
  return {
    interest: Math.min(99, base),
    speed: text.toLowerCase().includes("sorry") ? "Slow but considerate" : "Responsive",
    balance: text.split("?").length > 2 ? "Curious and balanced" : "Needs more questions",
    red: text.toLowerCase().includes("whatever") ? "Dismissive wording appeared" : "No major red flags detected",
    green: text.toLowerCase().includes("haha") || text.includes("😂") ? "Playful energy is present" : "Clear replies and room to build warmth",
    confidence: Math.max(40, Math.min(97, base - 5)),
    suggestions: Array.from({ length: 3 }, (_, index) => suggestions[(variation + index) % suggestions.length]),
  };
}

function initService(name: string, task?: () => void): ModuleRecord {
  try {
    task?.();
    return { name, ready: true };
  } catch (error) {
    console.error(error);
    return { name, ready: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export default function CharmCraftApp() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>("home");
  const [user, setUser] = useState<StoredUser>({ name: "Guest Charmer", email: "guest@charmcraft.app", guest: true, xp: 125, streak: 3, level: 2 });
  const [missions, setMissions] = useState<Mission[]>(defaultMissions);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [replyInput, setReplyInput] = useState("");
  const [replyResult, setReplyResult] = useState(replySet("", 0));
  const [chatInput, setChatInput] = useState("");
  const [chatResult, setChatResult] = useState(analyzeChat(""));
  const [pickupCategory, setPickupCategory] = useState<PickupCategory>("Funny");
  const [starterCategory, setStarterCategory] = useState<StarterCategory>("Friends");
  const [statusCategory, setStatusCategory] = useState<StatusCategory>("WhatsApp Status");
  const [pickupLine, setPickupLine] = useState<GeneratedContent>({ id: "pickup-initial", kind: "pickup", text: "Choose a category to generate a polished line." });
  const [starterLine, setStarterLine] = useState<GeneratedContent>({ id: "starter-initial", kind: "starter", text: "Choose a category to generate a conversation opener." });
  const [statusLine, setStatusLine] = useState<GeneratedContent>({ id: "status-initial", kind: "status", text: "Choose a category to generate a standout caption." });
  const [generationCounts, setGenerationCounts] = useState<Record<string, number>>({ reply: 0, analyzer: 0, pickup: 0, starter: 0, status: 0, insights: 0 });
  const [coachInput, setCoachInput] = useState("");
  const [coachThread, setCoachThread] = useState<ChatMessage[]>([{ role: "coach", text: "Coach Victor here. Ask me about dating, confidence, texting, friendships, or communication.", time: "Now" }]);
  const [coachMemory, setCoachMemory] = useState<CoachMemory>(createEmptyMemory());
  const [coachSending, setCoachSending] = useState(false);
  const [practiceMode, setPracticeMode] = useState("Beginner");
  const [practiceThread, setPracticeThread] = useState<ChatMessage[]>([{ role: "practice", text: "Practice partner ready. Send a message and I’ll respond in your selected mode.", time: "Now" }]);
  const [practiceInput, setPracticeInput] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [savedItems, setSavedItems] = useState<GeneratedContent[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<string[]>([]);
  const [moduleStatus, setModuleStatus] = useState<ModuleRecord[]>([]);
  const [toast, setToast] = useState("Ready offline");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [listeningTarget, setListeningTarget] = useState<VoiceTarget | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceTargetRef = useRef<VoiceTarget | null>(null);
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const initialized = useRef(false);

  const insightOffset = generationCounts.insights % dailyInsights.length;
  const currentInsight = dailyInsights[insightOffset];
  const visibleInsights = useMemo(() => Array.from({ length: 5 }, (_, index) => dailyInsights[(insightOffset + index) % dailyInsights.length]), [insightOffset]);
  const lastCoachResponse = useMemo(() => [...coachThread].reverse().find((message) => message.role === "coach"), [coachThread]);
  const completedXp = missions.filter((mission) => mission.done).reduce((sum, mission) => sum + mission.xp, 0);
  const dailyGoal = Number(ConfigService.get("dailyXpGoal", 75));
  const progress = Math.min(100, Math.round((completedXp / dailyGoal) * 100));
  const charmScore = useMemo(() => {
    const base = scoreFromText(`${replyInput} ${chatInput}`, user.level);
    return {
      Confidence: Math.min(99, base),
      Humor: Math.max(42, base - 8),
      Creativity: Math.max(45, base - 3),
      Conversation: Math.min(97, base + 2),
      Listening: Math.max(40, base - 6),
      Improvement: Math.min(100, 50 + user.streak * 8 + missions.filter((mission) => mission.done).length * 5),
    };
  }, [chatInput, missions, replyInput, user.level, user.streak]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast("Ready offline"), 2400);
  }

  function navigateTo(screenId: ScreenId) {
    try {
      if (!screens.includes(screenId)) return;
      setActiveScreen(screenId);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
    }
  }

  function bindEvents() {
    try {
      document.documentElement.dataset.charmcraft = "ready";
    } catch (error) {
      console.error(error);
    }
  }

  function restoreSession() {
    try {
      const restoredUser = safeParse<StoredUser>(window.localStorage.getItem(storageKeys.user), user);
      setUser(restoredUser);
      setMissions(safeParse<Mission[]>(window.localStorage.getItem(storageKeys.missions), defaultMissions));
      setFavorites(safeParse<string[]>(window.localStorage.getItem(storageKeys.favorites), []));
      setSavedItems(safeParse<GeneratedContent[]>(window.localStorage.getItem(storageKeys.savedItems), []));
      setFavoriteItems(safeParse<string[]>(window.localStorage.getItem(storageKeys.favoriteItems), []));
      setCoachThread(safeParse<ChatMessage[]>(window.localStorage.getItem(storageKeys.coach), coachThread));
      setCoachMemory(normalizeCoachMemory(safeParse<unknown>(window.localStorage.getItem(storageKeys.coachMemory), createEmptyMemory(restoredUser.name)), restoredUser.name));
    } catch (error) {
      console.error(error);
    }
  }

  function loadSettings() {
    try {
      const restored = safeParse<Partial<AppSettings>>(window.localStorage.getItem(storageKeys.settings), defaultSettings);
      setSettings({ ...defaultSettings, ...restored, voiceRate: Number(restored.voiceRate) || defaultSettings.voiceRate });
    } catch (error) {
      console.error(error);
      setSettings(defaultSettings);
    }
  }

  function init() {
    try {
      bindEvents();
      restoreSession();
      loadSettings();
      const modules = [
        initService("Repository", () => ConfigService.getAll()),
        initService("Auth"),
        initService("Sync"),
        initService("Notifications"),
        initService("Remote Config", () => ConfigService.set("remoteChecked", true)),
        initService("Performance"),
        initService("Analytics"),
        initService("Settings"),
        initService("Achievements"),
        initService("Missions"),
        initService("Insights"),
        initService("Premium"),
        initService("AI"),
        initService("Practice"),
        initService("Storage"),
      ];
      setModuleStatus(modules);
      saveJson(storageKeys.modules, modules);
      navigateTo("home");
    } catch (error) {
      console.error(error);
      navigateTo("home");
    }
  }

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    init();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.error(error));
    }
  }, []);

  useEffect(() => {
    try {
      const speechWindow = window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
      const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (!Recognition) return;
      const recognition = new Recognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
        if (!transcript) return;
        if (voiceTargetRef.current === "reply") setReplyInput(transcript);
        if (voiceTargetRef.current === "analyzer") setChatInput(transcript);
        if (voiceTargetRef.current === "coach") setCoachInput(transcript);
        if (voiceTargetRef.current === "practice") setPracticeInput(transcript);
        showToast("Voice captured");
      };
      recognition.onerror = () => showToast("Voice input was unavailable. Try again or type your message.");
      recognition.onend = () => setListeningTarget(null);
      recognitionRef.current = recognition;
      setSpeechSupported(true);
      return () => {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
        recognitionRef.current = null;
      };
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => () => {
    try {
      window.speechSynthesis?.cancel();
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => saveJson(storageKeys.user, user), [user]);
  useEffect(() => saveJson(storageKeys.missions, missions), [missions]);
  useEffect(() => saveJson(storageKeys.settings, settings), [settings]);
  useEffect(() => saveJson(storageKeys.favorites, favorites), [favorites]);
  useEffect(() => saveJson(storageKeys.savedItems, savedItems), [savedItems]);
  useEffect(() => saveJson(storageKeys.favoriteItems, favoriteItems), [favoriteItems]);
  useEffect(() => saveJson(storageKeys.coach, coachThread), [coachThread]);
  useEffect(() => saveJson(storageKeys.coachMemory, coachMemory), [coachMemory]);

  function classFor(screen: ScreenId) {
    return `screen ${activeScreen === screen ? "active" : ""}`;
  }

  function handleAuth(event: FormEvent<HTMLFormElement>, mode: "signin" | "signup" | "guest" | "forgot") {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const email = String(form.get("email") || "guest@charmcraft.app");
      const name = String(form.get("name") || email.split("@")[0] || "Charmer");
      if (mode === "forgot") {
        showToast("Password reset instructions saved for offline delivery.");
        navigateTo("signin");
        return;
      }
      setUser((previous) => ({ ...previous, name, email, guest: mode === "guest", xp: previous.xp || 100, streak: previous.streak || 1, level: previous.level || 1 }));
      setCoachMemory((memory) => ({ ...memory, userName: name }));
      showToast(mode === "guest" ? "Guest session started" : "Signed in successfully");
      navigateTo("home");
    } catch (error) {
      console.error(error);
    }
  }

  function completeMission(id: string) {
    setMissions((items) =>
      items.map((mission) => {
        if (mission.id !== id || mission.done) return mission;
        setUser((previous) => ({ ...previous, xp: previous.xp + mission.xp, level: Math.max(previous.level, Math.floor((previous.xp + mission.xp) / 100) + 1) }));
        showToast(`Mission complete: +${mission.xp} XP`);
        return { ...mission, done: true };
      }),
    );
  }

  function nextCount(key: string) {
    const next = (generationCounts[key] ?? 0) + 1;
    setGenerationCounts((counts) => ({ ...counts, [key]: next }));
    return next;
  }

  function itemId(kind: GeneratedContent["kind"], text: string) {
    return `${kind}:${[...text].reduce((sum, character) => sum + character.charCodeAt(0), 0)}`;
  }

  function runReplyAssistant() {
    const count = nextCount("reply");
    setReplyResult(replySet(replyInput, count));
    showToast("A fresh reply set is ready");
  }

  function runAnalyzer() {
    const count = nextCount("analyzer");
    setChatResult(analyzeChat(chatInput, count));
    showToast("Chat analysis refreshed");
  }

  function generatePickup(category = pickupCategory) {
    setPickupCategory(category);
    const count = nextCount("pickup");
    const text = selectLibraryItem(pickupLibraries[category], count, replyInput);
    setPickupLine({ id: itemId("pickup", text), kind: "pickup", label: category, text });
  }

  function generateStarter(category = starterCategory) {
    setStarterCategory(category);
    const count = nextCount("starter");
    const text = selectLibraryItem(starterLibraries[category], count, chatInput);
    setStarterLine({ id: itemId("starter", text), kind: "starter", label: category, text });
  }

  function generateStatus(category = statusCategory) {
    setStatusCategory(category);
    const count = nextCount("status");
    const text = selectLibraryItem(statusLibraries[category], count, user.name);
    setStatusLine({ id: itemId("status", text), kind: "status", label: category, text });
  }

  function saveGeneratedItem(item: GeneratedContent) {
    setSavedItems((items) => items.some((saved) => saved.id === item.id) ? items : [item, ...items].slice(0, 80));
    if (item.kind === "insight") completeMission("m3");
    showToast("Saved to your collection");
  }

  function toggleFavoriteItem(item: GeneratedContent) {
    setFavoriteItems((items) => items.includes(item.id) ? items.filter((id) => id !== item.id) : [item.id, ...items].slice(0, 120));
    if (item.kind === "insight") setFavorites((items) => items.includes(item.text) ? items.filter((text) => text !== item.text) : [item.text, ...items]);
    showToast(favoriteItems.includes(item.id) ? "Removed from favorites" : "Added to favorites");
  }

  async function copyText(text: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const temporary = document.createElement("textarea");
        temporary.value = text;
        temporary.style.position = "fixed";
        temporary.style.opacity = "0";
        document.body.appendChild(temporary);
        temporary.select();
        document.execCommand("copy");
        temporary.remove();
      }
      showToast("Copied to clipboard");
    } catch (error) {
      console.error(error);
      showToast("Copy was unavailable. Select the text to copy it.");
    }
  }

  async function shareText(text: string) {
    try {
      if (navigator.share) await navigator.share({ title: "CharmCraft", text });
      else await copyText(text);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);
      showToast("Share was unavailable. The text can still be copied.");
    }
  }

  function startVoiceInput(target: VoiceTarget) {
    try {
      if (!recognitionRef.current) {
        showToast("Voice input is not supported in this browser.");
        return;
      }
      if (listeningTarget) recognitionRef.current.abort();
      voiceTargetRef.current = target;
      setListeningTarget(target);
      recognitionRef.current.start();
      showToast("Listening… speak naturally");
    } catch (error) {
      console.error(error);
      setListeningTarget(null);
      showToast("Voice input could not start. Please try again.");
    }
  }

  function speakCoach(text: string) {
    try {
      if (!("speechSynthesis" in window)) {
        showToast("Voice playback is not supported in this browser.");
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/^Coach Victor:\s*/i, ""));
      utterance.rate = settings.voiceRate;
      utterance.onend = () => { setIsSpeaking(false); setIsSpeechPaused(false); };
      utterance.onerror = () => { setIsSpeaking(false); setIsSpeechPaused(false); showToast("Voice playback stopped unexpectedly."); };
      speechUtteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
      setIsSpeechPaused(false);
    } catch (error) {
      console.error(error);
      showToast("Voice playback was unavailable.");
    }
  }

  function toggleSpeechPause() {
    try {
      if (!("speechSynthesis" in window) || !isSpeaking) return;
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsSpeechPaused(false);
      } else {
        window.speechSynthesis.pause();
        setIsSpeechPaused(true);
      }
    } catch (error) {
      console.error(error);
    }
  }

  function stopSpeech() {
    try {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      setIsSpeechPaused(false);
    } catch (error) {
      console.error(error);
    }
  }

  async function sendCoach() {
    if (!coachInput.trim() || coachSending) return;
    const prompt = coachInput.trim();
    const topicMemory = updateCoachMemory(coachMemory, prompt, "communication", user);
    const userTurn: ChatMessage = { role: "user", text: prompt, time: nowTime() };
    const threadWithUser = [...coachThread, userTurn].slice(-18);
    setCoachInput("");
    setCoachThread(threadWithUser);
    setCoachSending(true);
    try {
      const fallback = buildOfflineCoachReply(prompt, topicMemory, threadWithUser);
      const updatedMemory = updateCoachMemory(topicMemory, prompt, fallback.topic, user);
      let reply = fallback.reply;
      let source = "offline";
      try {
        const response = await fetch("/api/coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, memory: updatedMemory, thread: threadWithUser }),
        });
        if (response.ok) {
          const result = await response.json() as { reply?: string; source?: string; topic?: CoachTopic };
          if (result.reply) {
            reply = result.reply;
            source = result.source ?? source;
            if (result.topic) updatedMemory.favoriteTopics = [result.topic, ...updatedMemory.favoriteTopics.filter((topic) => topic !== result.topic)].slice(0, 6);
          }
        }
      } catch (error) {
        console.error(error);
      }
      updatedMemory.recentResponses = [...updatedMemory.recentResponses, reply].slice(-16);
      setCoachMemory(updatedMemory);
      const coachTurn: ChatMessage = { role: "coach", text: reply, time: nowTime() };
      setCoachThread((thread): ChatMessage[] => [...thread, coachTurn].slice(-24));
      showToast(source === "llm" ? "Coach Victor personalized this with AI" : "Coach Victor replied offline");
    } catch (error) {
      console.error(error);
      showToast("Coach Victor could not respond. Please try again.");
    } finally {
      setCoachSending(false);
    }
  }

  function sendPractice() {
    if (!practiceInput.trim()) return;
    const text = practiceInput.trim();
    const count = nextCount("practice");
    const practiceReply = replySet(text, count).short;
    const practiceUserTurn: ChatMessage = { role: "user", text, time: nowTime() };
    const practiceCoachTurn: ChatMessage = { role: "practice", text: `${practiceMode}: Nice start. A warm, easy-to-answer version could be: “${practiceReply}”`, time: nowTime() };
    setPracticeThread((thread): ChatMessage[] => [...thread, practiceUserTurn, practiceCoachTurn].slice(-24));
    setPracticeInput("");
    showToast("Practice response ready");
  }

  function saveInsight(insight: string) {
    const item: GeneratedContent = { id: itemId("insight", insight), kind: "insight", text: insight, label: "Daily Insight" };
    setFavorites((items) => items.includes(insight) ? items : [...items, insight]);
    saveGeneratedItem(item);
  }

  function logout() {
    const guestUser = { name: "Guest Charmer", email: "guest@charmcraft.app", guest: true, xp: 125, streak: 3, level: 2 };
    setUser(guestUser);
    setCoachMemory(createEmptyMemory(guestUser.name));
    setCoachThread([{ role: "coach", text: "Coach Victor here. Ask me about dating, confidence, texting, friendships, or communication.", time: "Now" }]);
    stopSpeech();
    showToast("Logged out safely");
    navigateTo("welcome");
  }

  return (
    <main className="app-shell" aria-live="polite">
      <div className="phone-frame">
        <header className="app-topbar">
          <button className="icon-button" type="button" onClick={() => navigateTo("home")} aria-label="Go home">⌂</button>
          <div>
            <p className="eyebrow">CharmCraft</p>
            <h1>{activeScreen === "home" ? "Confidence Coach" : quickTools.find((tool) => tool.id === activeScreen)?.title ?? "CharmCraft"}</h1>
          </div>
          <button className="icon-button" type="button" onClick={() => navigateTo("account")} aria-label="Open account">👤</button>
        </header>

        <section id="splash" className={classFor("splash")}>
          <div className="brand-orb">✨</div>
          <h2>CharmCraft</h2>
          <p>AI conversation coaching that works offline and feels native.</p>
          <button className="primary-btn" type="button" onClick={() => navigateTo("welcome")}>Continue</button>
        </section>

        <section id="welcome" className={classFor("welcome")}>
          <div className="hero-card">
            <span className="badge">PWA Ready</span>
            <h2>Build charm through practice, insight, and confident replies.</h2>
            <p>Coach Victor, quick tools, missions, XP, and offline-first progress in one mobile app.</p>
          </div>
          <button className="primary-btn" type="button" onClick={() => navigateTo("signup")}>Create account</button>
          <button className="secondary-btn" type="button" onClick={() => navigateTo("signin")}>Sign in</button>
          <button className="ghost-btn" type="button" onClick={() => navigateTo("guest")}>Continue as guest</button>
        </section>

        <section id="signin" className={classFor("signin")}>
          <AuthCard title="Welcome back" submit="Sign in" onSubmit={(event) => handleAuth(event, "signin")} />
          <button className="ghost-btn" type="button" onClick={() => navigateTo("forgot")}>Forgot password?</button>
          <button className="ghost-btn" type="button" onClick={() => navigateTo("signup")}>Need an account?</button>
        </section>

        <section id="signup" className={classFor("signup")}>
          <AuthCard title="Create your profile" submit="Start coaching" withName onSubmit={(event) => handleAuth(event, "signup")} />
          <button className="ghost-btn" type="button" onClick={() => navigateTo("signin")}>Already registered?</button>
        </section>

        <section id="forgot" className={classFor("forgot")}>
          <form className="card stack" onSubmit={(event) => handleAuth(event, "forgot")}>
            <h2>Reset password</h2>
            <p>Enter your email. CharmCraft stores the request safely and resumes when online.</p>
            <input name="email" type="email" placeholder="email@example.com" required />
            <button className="primary-btn" type="submit">Send reset link</button>
          </form>
        </section>

        <section id="guest" className={classFor("guest")}>
          <form className="card stack" onSubmit={(event) => handleAuth(event, "guest")}>
            <h2>Guest login</h2>
            <p>Try every core tool locally. You can upgrade or sync later.</p>
            <input name="name" placeholder="Nickname" defaultValue="Guest Charmer" />
            <button className="primary-btn" type="submit">Enter app</button>
          </form>
        </section>

        <section id="home" className={classFor("home")}>
          <div className="dashboard-hero">
            <div>
              <p className="eyebrow">Level {user.level} • {user.streak} day streak</p>
              <h2>Hi, {user.name}</h2>
              <p>Train your social confidence today.</p>
            </div>
            <div className="xp-ring"><span>{progress}%</span></div>
          </div>

          <div className="card">
            <div className="row-between"><h3>Daily Progress</h3><strong>{completedXp}/{dailyGoal} XP</strong></div>
            <div className="progress"><span style={{ width: `${progress}%` }} /></div>
          </div>

          <div className="card stack">
            <div className="row-between"><h3>Daily Missions</h3><span className="badge">XP System</span></div>
            {missions.map((mission) => (
              <button key={mission.id} className={`mission ${mission.done ? "done" : ""}`} type="button" onClick={() => completeMission(mission.id)}>
                <span>{mission.done ? "✅" : "⬡"} {mission.label}</span><strong>+{mission.xp}</strong>
              </button>
            ))}
          </div>

          <div className="coach-card">
            <div><span className="badge">Coach Victor</span><h3>Ask for real-time conversation advice.</h3></div>
            <button className="secondary-btn" type="button" onClick={() => navigateTo("practice")}>Practice now</button>
          </div>

          <div className="card stack">
            <div className="row-between"><h3>Today’s Insight</h3><button className="mini-btn" type="button" onClick={() => { nextCount("insights"); showToast("Next daily insight ready"); }}>Another</button></div>
            <p>{currentInsight}</p>
            <ActionBar item={{ id: itemId("insight", currentInsight), kind: "insight", label: "Daily Insight", text: currentInsight }} onCopy={copyText} onShare={shareText} onSave={(item) => saveInsight(item.text)} onFavorite={toggleFavoriteItem} favoriteIds={favoriteItems} />
          </div>

          <button className="premium-banner" type="button" onClick={() => navigateTo("premium")}>
            <span>👑 Premium</span><strong>Unlock unlimited coaching and cloud sync</strong>
          </button>

          <div className="tool-grid">
            {quickTools.map((tool) => (
              <button key={tool.id} className="tool-card" type="button" onClick={() => navigateTo(tool.id)}>
                <span>{tool.icon}</span><strong>{tool.title}</strong><small>{tool.desc}</small>
              </button>
            ))}
          </div>
        </section>

        <section id="reply" className={classFor("reply")}>
          <ToolHeader title="Reply Assistant" body="Paste a conversation and generate fresh friendly, funny, romantic, confident, short, and long replies." />
          <div className="voice-field"><textarea value={replyInput} onChange={(event) => setReplyInput(event.target.value)} placeholder="Paste the conversation here" /><VoiceButton supported={speechSupported} listening={listeningTarget === "reply"} onClick={() => startVoiceInput("reply")} /></div>
          <button className="primary-btn" type="button" onClick={runReplyAssistant}>Generate a different reply set</button>
          <ResultList items={(Object.entries(replyResult) as Array<[string, string]>).map(([label, text]) => ({ label: label === "friendly" ? "Friendly / Better" : label, text, kind: "reply" }))} onCopy={copyText} onShare={shareText} onSave={saveGeneratedItem} onFavorite={toggleFavoriteItem} favoriteIds={favoriteItems} />
        </section>

        <section id="analyzer" className={classFor("analyzer")}>
          <ToolHeader title="Chat Analyzer" body="Understand interest, balance, signals, and next steps." />
          <div className="voice-field"><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Paste a chat to analyze" /><VoiceButton supported={speechSupported} listening={listeningTarget === "analyzer"} onClick={() => startVoiceInput("analyzer")} /></div>
          <button className="primary-btn" type="button" onClick={runAnalyzer}>Generate another analysis</button>
          <div className="metric-grid">
            <Metric label="Interest Level" value={`${chatResult.interest}%`} />
            <Metric label="Reply Speed" value={chatResult.speed} />
            <Metric label="Conversation Balance" value={chatResult.balance} />
            <Metric label="Confidence Score" value={`${chatResult.confidence}%`} />
          </div>
          <ResultList items={[{ label: "Red Flags", text: chatResult.red, kind: "analysis" }, { label: "Green Flags", text: chatResult.green, kind: "analysis" }, { label: "Suggestions", text: chatResult.suggestions.join(" • "), kind: "analysis" }]} onCopy={copyText} onShare={shareText} onSave={saveGeneratedItem} onFavorite={toggleFavoriteItem} favoriteIds={favoriteItems} />
        </section>

        <section id="pickup" className={classFor("pickup")}>
          <ToolHeader title="Pickup Lines" body="Generate funny, romantic, cute, bold, smooth, first-message, and ice-breaker lines." />
          <CategoryButtons items={categories.pickup} onPick={generatePickup} />
          <OutputCard item={pickupLine} onCopy={copyText} onShare={shareText} onSave={saveGeneratedItem} onFavorite={toggleFavoriteItem} onGenerateAnother={() => generatePickup()} favoriteIds={favoriteItems} />
        </section>

        <section id="starter" className={classFor("starter")}>
          <ToolHeader title="Conversation Starter" body="Start strong on WhatsApp, Instagram, Facebook, dating, friends, crushes, or random chats." />
          <CategoryButtons items={categories.starter} onPick={generateStarter} />
          <OutputCard item={starterLine} onCopy={copyText} onShare={shareText} onSave={saveGeneratedItem} onFavorite={toggleFavoriteItem} onGenerateAnother={() => generateStarter()} favoriteIds={favoriteItems} />
        </section>

        <section id="status" className={classFor("status")}>
          <ToolHeader title="Status Studio" body="Create captions, status updates, motivational lines, love quotes, funny and friendship statuses, and success quotes." />
          <CategoryButtons items={categories.status} onPick={generateStatus} />
          <OutputCard item={statusLine} onCopy={copyText} onShare={shareText} onSave={saveGeneratedItem} onFavorite={toggleFavoriteItem} onGenerateAnother={() => generateStatus()} favoriteIds={favoriteItems} />
        </section>

        <section id="score" className={classFor("score")}>
          <ToolHeader title="Charm Score" body="Your profile across confidence, humor, creativity, conversation, listening, and improvement." />
          <div className="card stack">
            {Object.entries(charmScore).map(([label, value]) => <ScoreBar key={label} label={label} value={value} />)}
          </div>
        </section>

        <section id="insights" className={classFor("insights")}>
          <ToolHeader title="Insights" body="A 365-tip coaching library. Save, favorite, share, or refresh your daily set." />
          <button className="secondary-btn" type="button" onClick={() => { nextCount("insights"); showToast("Fresh coaching insights ready"); }}>Generate another insight set</button>
          {visibleInsights.map((insight) => {
            const item: GeneratedContent = { id: itemId("insight", insight), kind: "insight", text: insight, label: "Daily Insight" };
            return <article className="card stack" key={insight}>
              <p>{insight}</p>
              <ActionBar item={item} onCopy={copyText} onShare={shareText} onSave={(generated) => saveInsight(generated.text)} onFavorite={toggleFavoriteItem} favoriteIds={favoriteItems} />
            </article>;
          })}
        </section>

        <section id="practice" className={classFor("practice")}>
          <ToolHeader title="Conversation Practice" body="Practice with Coach Victor across beginner, intermediate, advanced, flirting, and professional modes." />
          <CategoryButtons items={categories.practice} onPick={setPracticeMode} />
          <div className="chat-window">
            {practiceThread.map((message, index) => <ChatBubble key={`${message.time}-${index}`} message={message} />)}
          </div>
          <div className="composer"><input value={practiceInput} onChange={(event) => setPracticeInput(event.target.value)} placeholder={`Message in ${practiceMode}`} /><VoiceButton supported={speechSupported} listening={listeningTarget === "practice"} onClick={() => startVoiceInput("practice")} /><button type="button" onClick={sendPractice}>Send</button></div>
          <div className="card stack">
            <div className="row-between"><h3>Coach Victor</h3><span className="badge">{coachMemory.favoriteTopics[0]?.replace(/-/g, " ") ?? "communication"}</span></div>
            <div className="chat-window compact">{coachThread.map((message, index) => <ChatBubble key={`${message.time}-${index}`} message={message} />)}</div>
            {lastCoachResponse ? <div className="voice-output stack"><ActionBar item={{ id: itemId("coach", lastCoachResponse.text), kind: "coach", label: "Coach Victor", text: lastCoachResponse.text }} onCopy={copyText} onShare={shareText} onSave={saveGeneratedItem} onFavorite={toggleFavoriteItem} favoriteIds={favoriteItems} /><div className="voice-controls"><button className="mini-btn" type="button" onClick={() => speakCoach(lastCoachResponse.text)}>Play</button><button className="mini-btn" type="button" onClick={toggleSpeechPause} disabled={!isSpeaking}>{isSpeechPaused ? "Resume" : "Pause"}</button><button className="mini-btn" type="button" onClick={stopSpeech} disabled={!isSpeaking}>Stop</button><label className="voice-rate">Speed <select value={settings.voiceRate} onChange={(event) => setSettings({ ...settings, voiceRate: Number(event.target.value) })}><option value="0.8">0.8×</option><option value="1">1×</option><option value="1.2">1.2×</option><option value="1.4">1.4×</option></select></label></div></div> : null}
            <div className="composer"><input value={coachInput} onChange={(event) => setCoachInput(event.target.value)} placeholder="Ask about dating, texting, confidence..." /><VoiceButton supported={speechSupported} listening={listeningTarget === "coach"} onClick={() => startVoiceInput("coach")} /><button type="button" onClick={sendCoach} disabled={coachSending}>{coachSending ? "Thinking…" : "Ask"}</button></div>
          </div>
        </section>

        <section id="achievements" className={classFor("achievements")}>
          <ToolHeader title="Achievements" body="XP, badges, levels, daily streaks, and milestones." />
          <div className="achievement-card"><strong>{user.xp} XP</strong><span>Level {user.level}</span><small>{user.streak} day daily streak</small></div>
          <div className="badge-grid">
            {[
              ["First Spark", user.xp > 0],
              ["Confident Reply", replyInput.length > 0],
              ["Signal Reader", chatInput.length > 0],
              ["Insight Keeper", favorites.length > 0],
              ["Mission Climber", missions.some((mission) => mission.done)],
              ["Premium Mindset", user.premium],
            ].map(([label, unlocked]) => <div className={`badge-card ${unlocked ? "unlocked" : ""}`} key={String(label)}>{unlocked ? "🏅" : "🔒"}<span>{label}</span></div>)}
          </div>
        </section>

        <section id="account" className={classFor("account")}>
          <ToolHeader title="Account" body="Profile, email, theme, language, notifications, cloud sync, premium, and logout." />
          <div className="card stack">
            <label>Profile<input value={user.name} onChange={(event) => { const name = event.target.value; setUser({ ...user, name }); setCoachMemory({ ...coachMemory, userName: name }); }} /></label>
            <label>Email<input value={user.email} onChange={(event) => setUser({ ...user, email: event.target.value })} /></label>
            <label>Coaching goal<input value={coachMemory.goals[0] ?? ""} placeholder="e.g. feel more confident on first dates" onChange={(event) => setCoachMemory({ ...coachMemory, goals: event.target.value.trim() ? [event.target.value.trim(), ...coachMemory.goals.filter((goal) => goal !== event.target.value.trim())].slice(0, 8) : [] })} /></label>
            <label>Relationship status<input value={coachMemory.relationshipStatus ?? ""} placeholder="Optional: single, dating, married..." onChange={(event) => setCoachMemory({ ...coachMemory, relationshipStatus: event.target.value })} /></label>
            <label>Theme<select value={settings.theme} onChange={(event) => setSettings({ ...settings, theme: event.target.value })}><option>Dark</option><option>Midnight Purple</option></select></label>
            <label>Language<select value={settings.language} onChange={(event) => setSettings({ ...settings, language: event.target.value })}><option>English</option><option>Spanish</option><option>French</option></select></label>
            <label>Voice speed<select value={settings.voiceRate} onChange={(event) => setSettings({ ...settings, voiceRate: Number(event.target.value) })}><option value="0.8">0.8× Slow</option><option value="1">1× Normal</option><option value="1.2">1.2× Fast</option><option value="1.4">1.4× Faster</option></select></label>
            <Toggle label="Notifications" checked={settings.notifications} onChange={(checked) => setSettings({ ...settings, notifications: checked })} />
            <Toggle label="Cloud Sync" checked={settings.sync} onChange={(checked) => setSettings({ ...settings, sync: checked })} />
          </div>
          <div className="saved-summary"><span>Saved items: {savedItems.length}</span><span>Favorites: {favoriteItems.length}</span><span>Coach memory: {coachMemory.favoriteTopics.length} topics</span></div>
          <button className="primary-btn" type="button" onClick={() => navigateTo("premium")}>Manage Premium</button>
          <a className="secondary-btn link-btn" href="/admin.html">Open Admin Dashboard</a>
          <button className="danger-btn" type="button" onClick={logout}>Logout</button>
          <div className="module-list">{moduleStatus.map((module) => <span key={module.name}>{module.ready ? "✅" : "⚠️"} {module.name}</span>)}</div>
        </section>

        <section id="premium" className={classFor("premium")}>
          <ToolHeader title="Premium" body="Monthly and yearly upgrades with restore purchase and a premium badge." />
          <div className="pricing-card"><span className="badge">Monthly</span><strong>$6.99</strong><p>Unlimited quick tools, deeper Coach Victor guidance, and advanced practice.</p><button className="primary-btn" type="button" onClick={() => { setUser({ ...user, premium: true }); showToast("Monthly premium activated"); }}>Choose monthly</button></div>
          <div className="pricing-card featured"><span className="badge">Yearly</span><strong>$49.99</strong><p>Best value with cloud synchronization, premium badge, and priority AI config.</p><button className="primary-btn" type="button" onClick={() => { setUser({ ...user, premium: true }); showToast("Yearly premium activated"); }}>Choose yearly</button></div>
          <button className="secondary-btn" type="button" onClick={() => showToast(user.premium ? "Purchase restored" : "No previous purchase found")}>Restore purchase</button>
        </section>

        <nav className="bottom-nav" aria-label="Primary navigation">
          <button type="button" className={activeScreen === "home" ? "selected" : ""} onClick={() => navigateTo("home")}>🏠<span>Home</span></button>
          <button type="button" className={activeScreen === "reply" ? "selected" : ""} onClick={() => navigateTo("reply")}>💬<span>Reply</span></button>
          <button type="button" className={activeScreen === "practice" ? "selected" : ""} onClick={() => navigateTo("practice")}>🎯<span>Coach</span></button>
          <button type="button" className={activeScreen === "achievements" ? "selected" : ""} onClick={() => navigateTo("achievements")}>🏆<span>XP</span></button>
          <button type="button" className={activeScreen === "account" ? "selected" : ""} onClick={() => navigateTo("account")}>⚙️<span>Account</span></button>
        </nav>

        <div className="toast">{toast}</div>
      </div>
    </main>
  );
}

function AuthCard({ title, submit, withName, onSubmit }: { title: string; submit: string; withName?: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>{title}</h2>
      {withName ? <input name="name" placeholder="Your name" required /> : null}
      <input name="email" type="email" placeholder="email@example.com" required />
      <input name="password" type="password" placeholder="Password" minLength={4} required />
      <button className="primary-btn" type="submit">{submit}</button>
    </form>
  );
}

function ToolHeader({ title, body }: { title: string; body: string }) {
  return <div className="tool-header"><span className="badge">AI Tool</span><h2>{title}</h2><p>{body}</p></div>;
}

function ResultList({ items, onCopy, onShare, onSave, onFavorite, favoriteIds }: { items: Array<{ label: string; text: string; kind: GeneratedContent["kind"] }>; onCopy: (text: string) => void | Promise<void>; onShare: (text: string) => void | Promise<void>; onSave: (item: GeneratedContent) => void; onFavorite: (item: GeneratedContent) => void; favoriteIds: string[] }) {
  return <div className="result-list">{items.map((item) => {
    const generated: GeneratedContent = { ...item, id: `${item.kind}:${item.text}` };
    return <article className="result-card" key={`${item.label}-${item.text}`}><strong>{item.label}</strong><p>{item.text}</p><ActionBar item={generated} onCopy={onCopy} onShare={onShare} onSave={onSave} onFavorite={onFavorite} favoriteIds={favoriteIds} /></article>;
  })}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function CategoryButtons<T extends string>({ items, onPick }: { items: readonly T[]; onPick: (item: T) => void }) {
  return <div className="category-grid">{items.map((item) => <button className="chip" key={item} type="button" onClick={() => onPick(item)}>{item}</button>)}</div>;
}

function ActionBar({ item, onCopy, onShare, onSave, onFavorite, favoriteIds }: { item: GeneratedContent; onCopy: (text: string) => void | Promise<void>; onShare: (text: string) => void | Promise<void>; onSave: (item: GeneratedContent) => void; onFavorite: (item: GeneratedContent) => void; favoriteIds: string[] }) {
  const favorited = favoriteIds.includes(item.id);
  return <div className="action-bar"><button className="mini-btn" type="button" onClick={() => onCopy(item.text)}>Copy</button><button className="mini-btn" type="button" onClick={() => onShare(item.text)}>Share</button><button className="mini-btn" type="button" onClick={() => onSave(item)}>Save</button><button className="mini-btn" type="button" onClick={() => onFavorite(item)}>{favorited ? "Favorited" : "Favorite"}</button></div>;
}

function OutputCard({ item, onCopy, onShare, onSave, onFavorite, onGenerateAnother, favoriteIds }: { item: GeneratedContent; onCopy: (text: string) => void | Promise<void>; onShare: (text: string) => void | Promise<void>; onSave: (item: GeneratedContent) => void; onFavorite: (item: GeneratedContent) => void; onGenerateAnother: () => void; favoriteIds: string[] }) {
  return <div className="output-card"><p>{item.text}</p><ActionBar item={item} onCopy={onCopy} onShare={onShare} onSave={onSave} onFavorite={onFavorite} favoriteIds={favoriteIds} /><button className="secondary-btn" type="button" onClick={onGenerateAnother}>Generate another</button></div>;
}

function VoiceButton({ supported, listening, onClick }: { supported: boolean; listening: boolean; onClick: () => void }) {
  return <button className={`voice-button ${listening ? "listening" : ""}`} type="button" onClick={onClick} disabled={!supported} aria-label={supported ? "Use voice input" : "Voice input is not supported"} title={supported ? "Speak your message" : "Voice input is not supported"}>{listening ? "●" : "🎙"}</button>;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return <div className="score-row"><div className="row-between"><span>{label}</span><strong>{value}%</strong></div><div className="progress"><span style={{ width: `${value}%` }} /></div></div>;
}

function ChatBubble({ message }: { message: ChatMessage }) {
  return <div className={`bubble ${message.role === "user" ? "mine" : "theirs"}`}><p>{message.text}</p><span>{message.time}</span></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}
