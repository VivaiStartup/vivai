import React, { useEffect, useState } from "react";
import { login, register, me, startGoogleLogin } from "../services/authService";

type Mode = "LOGIN" | "REGISTER";

type MeUser = {
  id: number;
  email?: string | null;
  name?: string | null;
};

export default function LoginGate({
  children,
}:  { children: (user: any) => React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("LOGIN");
  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

const [meUser, setMeUser] = useState<MeUser | null>(null);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

 const refreshMe = async () => {
  setLoading(true);
  try {
    const r = await me();          // r = { user: ... }
    setMeUser(r.user ?? null);     // <-- QUESTA È LA CHIAVE
    setIsAuthed(!!r.user);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    refreshMe();
  }, []);

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "LOGIN") {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
      await refreshMe();
    } catch (e: any) {
      setError(e?.message ?? "Errore");
    } finally {
      setSubmitting(false);
    }
  };
if (!loading && meUser) return <>{children(meUser)}</>;
  if (loading) {
    return (
      <div className="min-h-screen bg-v-dark flex items-center justify-center">
        <p className="text-xs text-v-accent/60">Caricamento…</p>
      </div>
    );
  }

  if (isAuthed) return <>{children}</>;

  return (
    <div className="min-h-screen bg-v-dark flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-v-surface/20 border border-v-accent/10 rounded-3xl p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-v-light uppercase tracking-tighter">
            Vivai
          </h1>
          <p className="text-[10px] text-v-accent/60 font-bold uppercase tracking-widest">
            {mode === "LOGIN" ? "Accedi" : "Registrati"}
          </p>
        </div>

        <button
          onClick={startGoogleLogin}
          className="w-full bg-v-surface/60 border border-v-accent/10 text-v-light py-3 rounded-dex-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <i className="fa-brands fa-google"></i>
          Continua con Google
        </button>

        <div className="flex items-center gap-3 opacity-60">
          <div className="h-px flex-1 bg-v-accent/10" />
          <span className="text-[9px] text-v-accent/40 font-bold uppercase">oppure</span>
          <div className="h-px flex-1 bg-v-accent/10" />
        </div>

        {mode === "REGISTER" && (
          <input
            className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
            placeholder="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}

        <input
          className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full bg-v-dark/30 rounded-dex-lg px-4 py-3 text-xs outline-none border border-v-accent/10 text-v-light placeholder:text-v-accent/30 focus:border-v-accent/40 transition-all"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="text-[10px] text-v-accent/70 font-bold">
            {error}
          </p>
        )}

        <button
          disabled={submitting || !email || !password || (mode === "REGISTER" && !name)}
          onClick={onSubmit}
          className={`w-full py-3 rounded-dex-lg text-[10px] font-black uppercase tracking-widest transition-all ${
            submitting
              ? "bg-v-surface/40 text-v-accent/40 cursor-not-allowed"
              : "bg-v-accent text-v-dark"
          }`}
        >
          {submitting ? "Attendi…" : mode === "LOGIN" ? "Accedi" : "Crea account"}
        </button>

        <button
          onClick={() => setMode(mode === "LOGIN" ? "REGISTER" : "LOGIN")}
          className="w-full text-[10px] font-black uppercase tracking-widest text-v-accent/60"
        >
          {mode === "LOGIN" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
        </button>
      </div>
    </div>
  );
}