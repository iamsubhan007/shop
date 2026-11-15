// Unit checks for the delivery-hours window (no server needed): node scripts/test-hours.mjs
// Shop time is Asia/Karachi (UTC+5, no daylight saving), so 12:00 UTC is 17:00 in the shop.
import { withinWindow } from '../src/lib/hours.js';

let pass = 0, fail = 0;
const at = (hhmmShop) => { const [h, m] = hhmmShop.split(':').map(Number); return new Date(Date.UTC(2026, 10, 15, h - 5 < 0 ? h - 5 + 24 : h - 5, m)); };
const check = (name, got, want) => { const ok = got === want; ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  got ${got}, want ${want}`}`); };

check('12:00-22:00 at 15:30 -> inside', withinWindow('12:00', '22:00', at('15:30')), true);
check('12:00-22:00 at 11:59 -> outside', withinWindow('12:00', '22:00', at('11:59')), false);
check('12:00-22:00 at 12:00 -> inside (start is inclusive)', withinWindow('12:00', '22:00', at('12:00')), true);
check('12:00-22:00 at 22:00 -> outside (end is exclusive)', withinWindow('12:00', '22:00', at('22:00')), false);
check('12:00-22:00 at 23:30 -> outside', withinWindow('12:00', '22:00', at('23:30')), false);
check('overnight 18:00-02:00 at 23:00 -> inside', withinWindow('18:00', '02:00', at('23:00')), true);
check('overnight 18:00-02:00 at 01:30 -> inside', withinWindow('18:00', '02:00', at('01:30')), true);
check('overnight 18:00-02:00 at 02:00 -> outside', withinWindow('18:00', '02:00', at('02:00')), false);
check('overnight 18:00-02:00 at 12:00 -> outside', withinWindow('18:00', '02:00', at('12:00')), false);
check('start === end means all day', withinWindow('10:00', '10:00', at('03:00')), true);
check('missing times never block', withinWindow(undefined, undefined, at('03:00')), true);
check('malformed times never block', withinWindow('abc', '25', at('03:00')), true);
check('uses shop time, not UTC (00:30 shop is 19:30 UTC the day before)', withinWindow('00:00', '01:00', at('00:30')), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
