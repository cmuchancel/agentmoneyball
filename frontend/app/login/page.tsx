import { Database, LockKeyhole } from "lucide-react";

import { safeReturnTo } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.next);
  return <main className="login-screen">
    <section className="login-card">
      <div className="login-mark">⌁</div>
      <span className="login-kicker">Protected scouting workspace</span>
      <h1>Agent Moneyball</h1>
      <p>Enter the platform password to access the TrackMan demo and analysis tools.</p>
      <form action="/api/auth/login" method="post">
        <input type="hidden" name="next" value={returnTo}/>
        <label htmlFor="password">Platform password</label>
        <div className="login-input"><LockKeyhole size={15}/><input id="password" name="password" type="password" inputMode="numeric" autoComplete="current-password" autoFocus required/></div>
        {params.error ? <div className="login-error" role="alert">That password is not correct.</div> : null}
        <button type="submit">Unlock Agent Moneyball</button>
      </form>
      <footer><Database size={13}/> Demo dataset · 21 games · 3,344 pitches</footer>
    </section>
  </main>;
}
