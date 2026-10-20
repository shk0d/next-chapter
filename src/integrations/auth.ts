import { db, updateAccount, disconnectAccount } from "../db/database";
import { type Account, type Provider } from "../domain/model";
import { request } from "./http";
export const isExtension = () =>
  typeof chrome !== "undefined" && !!chrome.runtime?.id;
export const origins: Record<Provider, string[]> = {
  gmail: ["https://gmail.googleapis.com/*"],
  microsoft: [
    "https://graph.microsoft.com/*",
    "https://login.microsoftonline.com/*",
  ],
};
const msClient = import.meta.env.VITE_MICROSOFT_CLIENT_ID;
type Session = { token: string; expires: number; refresh?: string };
const sessionKey = (id: string) => `auth:${id}`;
export async function googleToken(interactive = false) {
  const result = await chrome.identity.getAuthToken({
    interactive,
    enableGranularPermissions: true,
    scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
  });
  if (!result.token) throw new Error("Google sign-in did not return a token.");
  return result.token;
}
async function exchangeMicrosoft(body: URLSearchParams): Promise<Session> {
  const response = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.access_token)
    throw new Error(
      "Microsoft token exchange failed. Check the SPA redirect registration, consent, and client ID; then reconnect.",
    );
  return {
    token: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
}
export async function accountToken(account: Account) {
  if (account.provider === "gmail") {
    const token = await googleToken();
    const profile = await request<{ emailAddress: string }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      token,
    );
    if (`gmail:${profile.emailAddress.toLowerCase()}` !== account.id)
      throw new Error(
        "Google account changed. Reconnect the original Gmail mailbox before syncing.",
      );
    return token;
  }
  const key = sessionKey(account.id);
  let session = (await chrome.storage.session.get(key))[key] as
    Session | undefined;
  if (!session)
    throw new Error(
      "Reconnect Outlook after restarting Chrome. Tokens are kept only for this browser session.",
    );
  if (session.expires < Date.now() + 60_000) {
    if (!session.refresh)
      throw new Error("Outlook sign-in expired. Reconnect your mailbox.");
    const next = await exchangeMicrosoft(
      new URLSearchParams({
        client_id: msClient,
        grant_type: "refresh_token",
        refresh_token: session.refresh,
        scope:
          "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access",
      }),
    );
    session = { ...next, refresh: next.refresh ?? session.refresh };
    await chrome.storage.session.set({ [key]: session });
  }
  return session.token;
}
export async function connect(
  provider: Provider,
  lookback: number,
  folders: string[] = ["inbox"],
) {
  if (!isExtension())
    throw new Error(
      "Email connections work in the unpacked Chrome extension. See README for installation.",
    );
  if (provider === "gmail" && !chrome.runtime.getManifest().oauth2?.client_id)
    throw new Error(
      "Set VITE_GOOGLE_CLIENT_ID in .env.local, rebuild, and reload the extension.",
    );
  if (provider === "microsoft" && !msClient)
    throw new Error(
      "Set VITE_MICROSOFT_CLIENT_ID in .env.local, rebuild, and reload the extension.",
    );
  // Invoked directly from the Connect button so optional permissions have a user gesture.
  if (!(await chrome.permissions.request({ origins: origins[provider] })))
    throw new Error("Mailbox host access was not granted.");
  let token: string;
  let session: Session | undefined;
  if (provider === "gmail") token = await googleToken(true);
  else {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = base64url(bytes);
    const challenge = base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    );
    const state = crypto.randomUUID();
    const redirect = chrome.identity.getRedirectURL("microsoft");
    const auth = new URL(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    auth.search = new URLSearchParams({
      client_id: msClient,
      response_type: "code",
      redirect_uri: redirect,
      response_mode: "query",
      scope:
        "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read offline_access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    const returned = await chrome.identity.launchWebAuthFlow({
      url: auth.href,
      interactive: true,
    });
    if (!returned) throw new Error("Microsoft sign-in cancelled.");
    const result = new URL(returned);
    if (
      result.origin + result.pathname !== redirect ||
      result.searchParams.get("state") !== state
    )
      throw new Error("Invalid Microsoft authorization response.");
    const code = result.searchParams.get("code");
    if (!code)
      throw new Error("Microsoft sign-in was cancelled or consent was denied.");
    session = await exchangeMicrosoft(
      new URLSearchParams({
        client_id: msClient,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        code_verifier: verifier,
      }),
    );
    token = session.token;
  }
  let id: string, label: string;
  if (provider === "gmail") {
    const profile = await request<{ emailAddress: string }>(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      token,
    );
    id = `gmail:${profile.emailAddress.toLowerCase()}`;
    label = profile.emailAddress;
  } else {
    const profile = await request<{
      id: string;
      mail?: string;
      userPrincipalName?: string;
    }>(
      "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName",
      token,
    );
    if (!profile.id)
      throw new Error("Microsoft did not return an account identifier.");
    id = `microsoft:${profile.id}`;
    label = profile.mail ?? profile.userPrincipalName ?? "Outlook mailbox";
  }
  const d = await db();
  for (const existing of await d.getAll("accounts"))
    if (
      existing.provider === provider &&
      existing.connected &&
      existing.id !== id
    )
      throw new Error(
        `Disconnect ${existing.label} before connecting another ${provider === "gmail" ? "Gmail" : "Outlook"} account.`,
      );
  const old = await d.get("accounts", id);
  const account: Account = {
    id,
    provider,
    label,
    connected: true,
    lookback: old?.connected ? old.lookback : lookback,
    folders: old?.folders ?? folders,
    generation: crypto.randomUUID(),
    lastSync: old?.lastSync,
  };
  if (session) await chrome.storage.session.set({ [sessionKey(id)]: session });
  await updateAccount(account);
  return account;
}
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export async function disconnect(account: Account) {
  await disconnectAccount(account.id);
  if (!isExtension()) return;
  if (account.provider === "microsoft")
    await chrome.storage.session.remove(sessionKey(account.id));
  else {
    try {
      const token = await googleToken(false);
      await chrome.identity.removeCachedAuthToken({ token });
    } catch {
      /* Already revoked. */
    }
  }
}
