#!/usr/bin/env node
/**
 * Generate the VAPID key pair used for background web push.
 *
 * Usage:
 *   node scripts/generate-vapid-keys.mjs
 *
 * Copy the printed values into `.env.local` for local development and into your
 * hosting provider's environment variables for deployments. Without them the app
 * still works: reminders are delivered in-app and `/api/push/*` reports
 * `configured: false`.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("Add these to .env.local (and to your deployment's environment):\n");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log("VAPID_SUBJECT=mailto:you@example.com");
