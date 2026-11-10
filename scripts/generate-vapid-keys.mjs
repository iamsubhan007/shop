// Prints a new VAPID key pair for push notifications: npm run push:keys
// Put the three lines in the Vercel environment variables (mark the private key "Sensitive") and in .env.local.
// Keep the SAME pair for as long as you want existing phones/PCs to keep receiving alerts: a new pair means every
// device has to tap "Turn on phone alerts" again.
import * as webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log('\nAdd these environment variables:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   # your real contact email; push services may use it to reach you\n');
