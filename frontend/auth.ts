import type { NextAuthOptions } from "next-auth";

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function refreshAccessToken(token: {
  refreshToken?: string;
  error?: string;
  expiresAt?: number;
}): Promise<{
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
}> {
  try {
    if (!token.refreshToken) {
      return { ...token, error: "No refresh token" };
    }

    const response = await fetch(`${internalIssuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        refresh_token: token.refreshToken,
      }),
    });

    if (!response.ok) {
      return { ...token, error: "Refresh token failed" };
    }

    const tokens = await response.json();

    return {
      ...token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000 + (tokens.expires_in ?? 0)),
    };
  } catch {
    return { ...token, error: "Refresh token exception" };
  }
}

const publicAuthority = process.env.NEXT_PUBLIC_OIDC_AUTHORITY ?? "";
const internalAuthority = process.env.OIDC_INTERNAL_AUTHORITY ?? publicAuthority;
const clientId = process.env.NEXT_PUBLIC_OIDC_CLIENT_ID ?? "";
const clientSecret = process.env.OIDC_CLIENT_SECRET;

const publicIssuer = withoutTrailingSlash(publicAuthority);
const internalIssuer = withoutTrailingSlash(internalAuthority);

type KeycloakProfile = {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  picture?: string;
};

const keycloakProvider = {
  id: "keycloak",
  name: "Keycloak",
  type: "oauth",
  issuer: publicIssuer,
  authorization: {
    url: `${publicIssuer}/protocol/openid-connect/auth`,
    params: {
      scope: "openid email profile",
    },
  },
  token: {
    url: `${internalIssuer}/protocol/openid-connect/token`,
  },
  userinfo: {
    url: `${internalIssuer}/protocol/openid-connect/userinfo`,
  },
  jwks_endpoint: `${internalIssuer}/protocol/openid-connect/certs`,
  checks: ["pkce", "state"],
  clientId,
  clientSecret: clientSecret ?? "",
  client: {
    token_endpoint_auth_method: clientSecret ? "client_secret_post" : "none",
  },
  profile(profile: KeycloakProfile) {
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username ?? profile.email ?? "",
      email: profile.email ?? null,
      image: profile.picture ?? null,
    };
  },
};

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [keycloakProvider as never],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) {
        const decoded = decodeJwt(account.access_token);
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        const expiresIn = account.expires_in as number | undefined;
        token.expiresAt = account.expires_at
          ? Number(account.expires_at)
          : Math.floor(Date.now() / 1000 + (expiresIn ?? 300));
        if (decoded) {
          token.roles = (decoded.realm_access as { roles?: string[] })?.roles ?? [];
        }
        return token;
      }

      const expiresAt = token.expiresAt as number | undefined;
      if (expiresAt && Date.now() < expiresAt * 1000) {
        return token;
      }

      return await refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (typeof token.accessToken === "string") {
        session.accessToken = token.accessToken;
      }
      session.roles = token.roles;
      session.error = token.error;
      return session;
    },
  },
};
