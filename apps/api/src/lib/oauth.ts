import * as arctic from "arctic";
import type { OAuthProvider, User } from "@ordena/database";
import { prisma } from "@ordena/database";
import jwt from "jsonwebtoken";
import { AppError } from "../middleware/error-handler";
import { getJwtSecret } from "../utils/jwt";

export type OAuthProviderSlug = "google" | "apple" | "facebook";

const SLUG_TO_ENUM: Record<OAuthProviderSlug, OAuthProvider> = {
  google: "GOOGLE",
  apple: "APPLE",
  facebook: "FACEBOOK",
};

const OAUTH_COOKIE = "ordena_oauth";
const OTP_TTL_MS = 60_000;
const STATE_TTL_SEC = 10 * 60;

type OAuthStatePayload = {
  state: string;
  codeVerifier?: string;
  next: string;
  provider: OAuthProviderSlug;
};

export function isOAuthProviderSlug(value: string): value is OAuthProviderSlug {
  return value === "google" || value === "apple" || value === "facebook";
}

export function oauthRedirectBase() {
  return (
    process.env.OAUTH_REDIRECT_BASE?.replace(/\/$/, "") ||
    process.env.API_URL?.replace(/\/$/, "") ||
    `http://localhost:${process.env.API_PORT ?? 4000}`
  );
}

export function customerAppUrl() {
  return (process.env.CUSTOMER_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function callbackUrl(provider: OAuthProviderSlug) {
  return `${oauthRedirectBase()}/auth/oauth/${provider}/callback`;
}

function applePrivateKeyBytes(): Uint8Array | null {
  const raw = process.env.APPLE_PRIVATE_KEY;
  if (!raw?.trim()) return null;
  const pem = raw.replace(/\\n/g, "\n");
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!body) return null;
  return new Uint8Array(Buffer.from(body, "base64"));
}

export function getConfiguredProviders(): OAuthProviderSlug[] {
  const list: OAuthProviderSlug[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    list.push("google");
  }
  if (
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    applePrivateKeyBytes()
  ) {
    list.push("apple");
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    list.push("facebook");
  }
  return list;
}

function createGoogle() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new arctic.Google(id, secret, callbackUrl("google"));
}

function createApple() {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const key = applePrivateKeyBytes();
  if (!clientId || !teamId || !keyId || !key) return null;
  return new arctic.Apple(clientId, teamId, keyId, key, callbackUrl("apple"));
}

function createFacebook() {
  const id = process.env.FACEBOOK_CLIENT_ID;
  const secret = process.env.FACEBOOK_CLIENT_SECRET;
  if (!id || !secret) return null;
  return new arctic.Facebook(id, secret, callbackUrl("facebook"));
}

export function sanitizeNext(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

export function createOAuthStateCookie(payload: OAuthStatePayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: STATE_TTL_SEC });
}

export function readOAuthStateCookie(
  cookieValue: string | undefined,
): OAuthStatePayload {
  if (!cookieValue) {
    throw new AppError(400, "Sesión OAuth inválida o expirada");
  }
  try {
    const data = jwt.verify(cookieValue, getJwtSecret()) as OAuthStatePayload;
    if (!data.state || !data.provider || !isOAuthProviderSlug(data.provider)) {
      throw new Error("invalid");
    }
    return {
      state: data.state,
      codeVerifier: data.codeVerifier,
      next: sanitizeNext(data.next),
      provider: data.provider,
    };
  } catch {
    throw new AppError(400, "Sesión OAuth inválida o expirada");
  }
}

export { OAUTH_COOKIE };

export async function buildAuthorizationUrl(
  provider: OAuthProviderSlug,
  next: string,
): Promise<{ url: URL; cookieValue: string }> {
  const state = arctic.generateState();
  const nextPath = sanitizeNext(next);

  if (provider === "google") {
    const google = createGoogle();
    if (!google) throw new AppError(503, "Google OAuth no está configurado");
    const codeVerifier = arctic.generateCodeVerifier();
    const url = google.createAuthorizationURL(state, codeVerifier, [
      "openid",
      "profile",
      "email",
    ]);
    const cookieValue = createOAuthStateCookie({
      state,
      codeVerifier,
      next: nextPath,
      provider,
    });
    return { url, cookieValue };
  }

  if (provider === "apple") {
    const apple = createApple();
    if (!apple) throw new AppError(503, "Apple OAuth no está configurado");
    const url = apple.createAuthorizationURL(state, ["name", "email"]);
    url.searchParams.set("response_mode", "form_post");
    const cookieValue = createOAuthStateCookie({
      state,
      next: nextPath,
      provider,
    });
    return { url, cookieValue };
  }

  const facebook = createFacebook();
  if (!facebook) throw new AppError(503, "Facebook OAuth no está configurado");
  const url = facebook.createAuthorizationURL(state, [
    "email",
    "public_profile",
  ]);
  const cookieValue = createOAuthStateCookie({
    state,
    next: nextPath,
    provider,
  });
  return { url, cookieValue };
}

type ProviderProfile = {
  providerAccountId: string;
  email: string;
  name: string | null;
  image: string | null;
};

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) throw new AppError(400, "Token OAuth inválido");
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

async function fetchGoogleProfile(
  accessToken: string,
  idToken?: string,
): Promise<ProviderProfile> {
  if (idToken) {
    const claims = decodeJwtPayload(idToken);
    const email = String(claims.email ?? "").toLowerCase();
    if (email) {
      return {
        providerAccountId: String(claims.sub ?? ""),
        email,
        name: typeof claims.name === "string" ? claims.name : null,
        image: typeof claims.picture === "string" ? claims.picture : null,
      };
    }
  }

  const res = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new AppError(502, "No se pudo obtener el perfil de Google");
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  const email = (data.email ?? "").toLowerCase();
  if (!email || !data.sub) {
    throw new AppError(
      400,
      "Google no compartió un email. Usa otro método de acceso.",
    );
  }
  return {
    providerAccountId: data.sub,
    email,
    name: data.name ?? null,
    image: data.picture ?? null,
  };
}

async function fetchAppleProfile(
  idToken: string,
  formName?: string | null,
): Promise<ProviderProfile> {
  const claims = decodeJwtPayload(idToken);
  const email = String(claims.email ?? "").toLowerCase();
  const sub = String(claims.sub ?? "");
  if (!email || !sub) {
    throw new AppError(
      400,
      "Apple no compartió un email. Usa otro método de acceso.",
    );
  }
  return {
    providerAccountId: sub,
    email,
    name: formName?.trim() || null,
    image: null,
  };
}

async function fetchFacebookProfile(
  accessToken: string,
): Promise<ProviderProfile> {
  const url = new URL("https://graph.facebook.com/me");
  url.searchParams.set("fields", "id,name,email,picture.type(large)");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  if (!res.ok) {
    throw new AppError(502, "No se pudo obtener el perfil de Facebook");
  }
  const data = (await res.json()) as {
    id?: string;
    name?: string;
    email?: string;
    picture?: { data?: { url?: string } };
  };
  const email = (data.email ?? "").toLowerCase();
  if (!email || !data.id) {
    throw new AppError(
      400,
      "Facebook no compartió un email. Usa otro método de acceso.",
    );
  }
  return {
    providerAccountId: data.id,
    email,
    name: data.name ?? null,
    image: data.picture?.data?.url ?? null,
  };
}

export async function exchangeCodeForProfile(
  provider: OAuthProviderSlug,
  code: string,
  codeVerifier: string | undefined,
  appleUserJson?: string | null,
): Promise<ProviderProfile> {
  if (provider === "google") {
    const google = createGoogle();
    if (!google) throw new AppError(503, "Google OAuth no está configurado");
    if (!codeVerifier) throw new AppError(400, "Falta code verifier PKCE");
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);
    let idToken: string | undefined;
    try {
      idToken = tokens.idToken();
    } catch {
      idToken = undefined;
    }
    return fetchGoogleProfile(tokens.accessToken(), idToken);
  }

  if (provider === "apple") {
    const apple = createApple();
    if (!apple) throw new AppError(503, "Apple OAuth no está configurado");
    const tokens = await apple.validateAuthorizationCode(code);
    let formName: string | null = null;
    if (appleUserJson) {
      try {
        const parsed = JSON.parse(appleUserJson) as {
          name?: { firstName?: string; lastName?: string };
        };
        const parts = [parsed.name?.firstName, parsed.name?.lastName].filter(
          Boolean,
        );
        formName = parts.length ? parts.join(" ") : null;
      } catch {
        formName = null;
      }
    }
    return fetchAppleProfile(tokens.idToken(), formName);
  }

  const facebook = createFacebook();
  if (!facebook) throw new AppError(503, "Facebook OAuth no está configurado");
  const tokens = await facebook.validateAuthorizationCode(code);
  return fetchFacebookProfile(tokens.accessToken());
}

export async function upsertOAuthUser(
  provider: OAuthProviderSlug,
  profile: ProviderProfile,
): Promise<User> {
  const providerEnum = SLUG_TO_ENUM[provider];

  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: providerEnum,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    if (existingAccount.user.role !== "CUSTOMER") {
      throw new AppError(
        403,
        "Esta cuenta no puede iniciar sesión como cliente",
      );
    }
    return prisma.user.update({
      where: { id: existingAccount.userId },
      data: {
        name: existingAccount.user.name ?? profile.name,
        image: existingAccount.user.image ?? profile.image,
      },
    });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: profile.email },
  });

  if (existingUser) {
    if (existingUser.role !== "CUSTOMER") {
      throw new AppError(
        403,
        "Este email pertenece a una cuenta de staff. Usa el portal correspondiente.",
      );
    }
    await prisma.oAuthAccount.create({
      data: {
        provider: providerEnum,
        providerAccountId: profile.providerAccountId,
        userId: existingUser.id,
      },
    });
    return prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name: existingUser.name ?? profile.name,
        image: existingUser.image ?? profile.image,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      image: profile.image,
      role: "CUSTOMER",
      oauthAccounts: {
        create: {
          provider: providerEnum,
          providerAccountId: profile.providerAccountId,
        },
      },
    },
  });
}

export async function createOneTimeCode(userId: string): Promise<string> {
  const code = arctic.generateState() + arctic.generateState();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Limpieza oportunista de códigos vencidos
  await prisma.oAuthOneTimeCode.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  await prisma.oAuthOneTimeCode.create({
    data: { code, userId, expiresAt },
  });

  return code;
}

export async function consumeOneTimeCode(code: string): Promise<string> {
  const entry = await prisma.oAuthOneTimeCode.findUnique({ where: { code } });
  if (!entry) {
    throw new AppError(400, "Código OAuth inválido o expirado");
  }

  await prisma.oAuthOneTimeCode.delete({ where: { id: entry.id } }).catch(() => undefined);

  if (entry.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, "Código OAuth inválido o expirado");
  }

  return entry.userId;
}

export function oauthErrorRedirect(message: string, next = "/") {
  const url = new URL("/auth/callback", customerAppUrl());
  url.searchParams.set("error", message);
  url.searchParams.set("next", sanitizeNext(next));
  return url.toString();
}

export function oauthSuccessRedirect(code: string, next: string) {
  const url = new URL("/auth/callback", customerAppUrl());
  url.searchParams.set("code", code);
  url.searchParams.set("next", sanitizeNext(next));
  return url.toString();
}
