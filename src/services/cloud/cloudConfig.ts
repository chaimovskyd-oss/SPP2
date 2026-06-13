export interface CloudConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  redirectUrl: string;
  configured: boolean;
  backend: "worker" | "supabase";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultRedirectUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}#/cloud-auth`;
}

export function getCloudConfig(): CloudConfig {
  const apiUrl = stripTrailingSlash(import.meta.env.VITE_SPP2_CLOUD_API_URL ?? "");
  const supabaseUrl = stripTrailingSlash(import.meta.env.VITE_SUPABASE_URL ?? "");
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
  const redirectUrl = import.meta.env.VITE_SPP2_CLOUD_REDIRECT_URL ?? defaultRedirectUrl();
  const hasSupabase = supabaseUrl.length > 0 && supabasePublishableKey.length > 0;
  return {
    apiUrl,
    supabaseUrl,
    supabasePublishableKey,
    redirectUrl,
    configured: hasSupabase,
    backend: apiUrl.length > 0 ? "worker" : "supabase"
  };
}
