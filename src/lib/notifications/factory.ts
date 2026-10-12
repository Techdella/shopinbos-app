import "server-only";

import type { NotificationProvider } from "./provider";
import type { ProviderName, ProviderConfig } from "./types";
import { AfricaTalkingProvider } from "./africastalking";
import { SendChampProvider } from "./sendchamp";

const providerInstances = new Map<string, NotificationProvider>();

export function createProvider(
  name: ProviderName,
  config: ProviderConfig,
): NotificationProvider {
  switch (name) {
    case "africastalking": {
      if (!config.username || !config.apiKey) {
        throw new Error(
          "Africa's Talking requires both username and apiKey",
        );
      }
      return new AfricaTalkingProvider({
        username: config.username,
        apiKey: config.apiKey,
        sandbox: config.sandbox,
      });
    }
    case "sendchamp": {
      if (!config.apiKey) {
        throw new Error("SendChamp requires an apiKey");
      }
      return new SendChampProvider({
        apiKey: config.apiKey,
        defaultSenderName: config.defaultSenderName,
        defaultRoute: config.defaultRoute,
      });
    }
    case "termii": {
      // Termii is SMS only and goes through src/lib/sms (sendSms in ./service uses it with failover).
      throw new Error("Termii isn't a notification provider class; use sendSms from @/lib/notifications/service");
    }
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown provider: ${_exhaustive}`);
    }
  }
}

export function getProvider(name: string): NotificationProvider | null {
  return providerInstances.get(name) ?? null;
}

export function registerProvider(name: string, provider: NotificationProvider): void {
  providerInstances.set(name, provider);
}

export function clearProviders(): void {
  providerInstances.clear();
}
