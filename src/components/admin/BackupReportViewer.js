'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FolderOpen, Printer, X } from 'lucide-react';
import { rs } from '@/components/admin/api';
import { backupInfo, buildReport, checkBackup, ordersToCsv, pkDay, shiftPeriod } from '@/lib/backupReport';

// Opens a downloaded backup file ON THIS DEVICE (nothing is uploaded) and shows a report for any day, week or month in it.

const box = 'bg-white rounded-2xl border border-zinc-200 p-4';
const inp = 'border border-zinc-300 rounded-lg px-2.5 py-2 text-sm bg-white';
const MAX_FILE_BYTES = 150 * 1024 * 1024;
const todayPk = () => pkDay(Date.now());
const PAY = { cod: 'Cash on delivery', bank_transfer: 'Bank transfer', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' };
const fmtTime = (ms) => new Date(ms).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayTitle = (d) => new Date(`${d}T12:00:00+05:00`).toLocaleDateString('en-PK', { timeZone: 'Asia/Karachi', weekday: 'short', day: 'numeric', month: 'short' });

async function readBackupFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to be a backup of this shop.');
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  let text;
  if (head[0] === 0x1f && head[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error("This browser cannot open .gz backups. Please use a recent Chrome, Edge, Firefox or Safari (on iPhone: iOS 16.4 or newer).");
    text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  } else {
    text = await file.text();
  }
  try { return JSON.parse(text); } catch { throw new Error('That file could not be read as a shop backup.'); }
}

function Row({ k, v, bold }) {
  return <div className={`flex justify-between gap-3 py-1 text-sm ${bold ? 'font-black border-t mt-1 pt-2' : ''}`}><span>{k}</span><span className="whitespace-nowrap">{v}</span></div>;
}
function List({ rows, a, b, fmt = (v) => v, empty = 'Nothing in this period.' }) {
  if (!rows?.length) return <p className="text-xs text-zinc-400">{empty}</p>;
  return <ul className="text-sm divide-y">{rows.map((r, i) => <li key={i} className="py-1.5 flex justify-between gap-3"><span className="truncate">{r[a]}</span><span className="font-semibold whitespace-nowrap">{fmt(r[b], r)}</span></li>)}</ul>;
}

export default function BackupReportViewer() {
  const [data, setData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState('day');
  const [date, setDate] = useState(todayPk());

  const info = useMemo(() => (data ? backupInfo(data) : null), [data]);
  const report = useMemo(() => (data ? buildReport(data, { period, date }) : null), [data, period, date]);

  const open = async (file) => {
    if (!file) return;
    setErr(''); setBusy(true);
    try {
      const parsed = await readBackupFile(file);
      const problem = checkBackup(parsed);
      if (problem) throw new Error(problem);
      const i = backupInfo(parsed);
      setData(parsed); setFileName(file.name);
      setDate(i.lastDay || todayPk()); setPeriod('day');
    } catch (e) { setErr(e.message || 'That file could not be opened.'); setData(null); }
    setBusy(false);
  };
  const close = () => { setData(null); setFileName(''); setErr(''); };

  const changePeriod = (p) => { setPeriod(p); };
  const csv = () => {
    const blob = new Blob(['﻿' + ordersToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `orders-${period}-${date}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const s = report?.summary;
  const maxSales = report ? Math.max(1, ...report.byDay.map((d) => d.sales)) : 1;
  const outside = report && info?.firstDay && s.received === 0;

  return (
    <section className={box} aria-label="Report from a saved backup">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1 print:hidden">
        <h2 className="font-black">Report from a saved backup</h2>
        {data && <button onClick={close} className="flex items-center gap-1 text-xs font-semibold text-zinc-500"><X size={14} /> Close file</button>}
      </div>
      <p className="text-xs text-zinc-500 mb-3 print:hidden">
        Open a backup you downloaded earlier (a file named <code>hbt-backup-….json.gz</code>) to see sales for any day, week or month in it.
        The file is read on this phone or computer only; nothing is uploaded and nothing in the live shop changes.
      </p>

      {!data && (
        <div className="print:hidden">
          <label className="inline-flex items-center gap-2 bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm cursor-pointer">
            <FolderOpen size={16} /> {busy ? 'Reading…' : 'Open a backup file'}
            <input type="file" accept=".gz,.json,application/gzip,application/x-gzip,application/json" className="sr-only" aria-label="Choose a backup file" disabled={busy}
              onChange={(e) => { open(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-red-700 mt-2 print:hidden">{err}</p>}

      {data && report && (
        <div className="space-y-5">
          <p className="text-xs text-zinc-500 print:hidden">
            <strong className="text-zinc-700">{fileName}</strong>
            {info.takenAt && <> · taken {new Date(info.takenAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}</>}
            {' · '}{info.orders} orders{info.firstDay && <>, {info.firstDay} to {info.lastDay}</>}
          </p>

          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <div className="inline-flex rounded-lg border overflow-hidden" role="group" aria-label="Report period">
              {[['day', 'Day'], ['week', 'Week'], ['month', 'Month']].map(([p, l]) => (
                <button key={p} onClick={() => changePeriod(p)} aria-pressed={period === p} className={`px-3.5 py-2 text-sm font-semibold ${period === p ? 'bg-zinc-900 text-white' : 'bg-white'}`}>{l}</button>
              ))}
            </div>
            <button onClick={() => setDate(shiftPeriod(period, date, -1))} aria-label="Previous" className="p-2 border rounded-lg"><ChevronLeft size={16} /></button>
            <input type={period === 'month' ? 'month' : 'date'} value={period === 'month' ? date.slice(0, 7) : date} aria-label="Report date"
              onChange={(e) => e.target.value && setDate(period === 'month' ? `${e.target.value}-01` : e.target.value)} className={inp} />
            <button onClick={() => setDate(shiftPeriod(period, date, 1))} aria-label="Next" className="p-2 border rounded-lg"><ChevronRight size={16} /></button>
            <div className="ml-auto flex gap-2">
              <button onClick={csv} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-semibold"><Download size={14} /> CSV</button>
              <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm font-semibold"><Printer size={14} /> Print / PDF</button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black" data-testid="report-title">{report.label}</h3>
            <p className="text-xs text-zinc-500 hidden print:block">From backup {fileName}</p>
            {outside && <p className="text-xs text-amber-700 mt-1">There are no orders in this file for {report.label}. This backup covers {info.firstDay} to {info.lastDay}.</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-x-8" data-testid="report-summary">
            <div>
              <h4 className="text-xs font-bold text-zinc-500 mb-1">ORDERS</h4>
              <Row k="Received" v={s.received} /><Row k="Completed" v={s.completed} /><Row k="Cancelled / rejected" v={s.cancelled} /><Row k="Still open when backed up" v={s.inProgress} />
              <Row k="Pickup" v={s.pickup} /><Row k="Delivery" v={s.delivery} />
              <Row k="Average order" v={rs(s.averageOrder)} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-500 mb-1">SALES AND MONEY</h4>
              <Row k="Sales (cancelled left out)" v={rs(s.gross)} bold />
              <Row k="Bank transfers (verified)" v={rs(s.bankVerified)} /><Row k="JazzCash (verified)" v={rs(s.jazzcashVerified)} /><Row k="EasyPaisa (verified)" v={rs(s.easypaisaVerified)} /><Row k="COD collected" v={rs(s.codCollected)} />
              <Row k="Total collected" v={rs(s.collected)} bold />
              <Row k="Pending / unverified payments" v={rs(s.pendingPayments)} /><Row k="Outstanding COD" v={rs(s.outstandingCod)} />
              <Row k="Discounts given" v={rs(s.discounts)} /><Row k="Delivery fees" v={rs(s.deliveryFees)} />
            </div>
          </div>

          {period !== 'day' && (
            <div>
              <h4 className="text-xs font-bold text-zinc-500 mb-1">DAY BY DAY</h4>
              <ul className="text-sm divide-y">
                {report.byDay.map((d) => (
                  <li key={d.day} className="py-1.5 grid grid-cols-[5.5rem_3rem_1fr_5.5rem] items-center gap-2">
                    <span>{dayTitle(d.day)}</span><span className="text-zinc-500 text-xs">{d.orders} orders</span>
                    <span className="h-2 rounded bg-zinc-100 overflow-hidden"><span className="block h-full bg-red-600" style={{ width: `${(d.sales / maxSales) * 100}%` }} /></span>
                    <span className="text-right font-semibold">{rs(d.sales)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div><h4 className="text-xs font-bold text-zinc-500 mb-1">BEST SELLERS (quantity)</h4><List rows={report.bestSellers} a="title" b="qty" fmt={(v) => `${v} sold`} /></div>
            <div><h4 className="text-xs font-bold text-zinc-500 mb-1">TOP BY REVENUE</h4><List rows={report.topRevenue} a="title" b="revenue" fmt={rs} /></div>
            <div><h4 className="text-xs font-bold text-zinc-500 mb-1">CATEGORIES</h4><List rows={report.categories} a="title" b="revenue" fmt={rs} /></div>
            <div><h4 className="text-xs font-bold text-zinc-500 mb-1">HOW CUSTOMERS PAID</h4><List rows={report.byPayment.map((p) => ({ t: `${PAY[p.method] || p.method} (${p.orders})`, amount: p.amount }))} a="t" b="amount" fmt={rs} /></div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div><h4 className="text-xs font-bold text-zinc-500 mb-1">BUSIEST HOURS</h4><List rows={report.busiestHours} a="hour" b="orders" fmt={(v) => `${v} orders`} empty="No sales in this period." /></div>
            <div data-testid="report-feedback">
              <h4 className="text-xs font-bold text-zinc-500 mb-1">CUSTOMER FEEDBACK</h4>
              {report.feedback.count === 0 ? <p className="text-xs text-zinc-400">No ratings for orders in this period.</p> : (
                <>
                  <p className="text-sm"><strong>{report.feedback.average}</strong> / 5 from {report.feedback.count} rating{report.feedback.count === 1 ? '' : 's'}
                    <span className="text-zinc-400"> · {report.feedback.distribution.map((c, i) => `${i + 1}★ ${c}`).reverse().join(' · ')}</span></p>
                  <ul className="mt-1 space-y-1 text-xs text-zinc-600">{report.feedback.comments.map((c, i) => <li key={i}>“{c.comment}” <span className="text-zinc-400">{c.rating}★ · {c.orderNumber}</span></li>)}</ul>
                </>
              )}
            </div>
          </div>

          <details className="print:hidden" open={report.orders.length > 0 && report.orders.length <= 15}>
            <summary className="cursor-pointer text-sm font-bold">Orders in this period ({report.orders.length})</summary>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-zinc-500"><th className="py-1 pr-3">Order</th><th className="pr-3">When</th><th className="pr-3">Customer</th><th className="pr-3">Type</th><th className="pr-3">Status</th><th className="text-right">Total</th></tr></thead>
                <tbody className="divide-y">
                  {report.orders.slice(0, 500).map((o) => (
                    <tr key={o.orderNumber}><td className="py-1 pr-3 font-semibold whitespace-nowrap">{o.orderNumber}</td><td className="pr-3 whitespace-nowrap">{fmtTime(o.createdAt)}</td><td className="pr-3">{o.customerName}</td><td className="pr-3">{o.type}</td><td className="pr-3">{o.status}</td><td className="text-right whitespace-nowrap">{rs(o.total)}</td></tr>
                  ))}
                </tbody>
              </table>
              {report.orders.length > 500 && <p className="text-xs text-zinc-400 mt-1">Showing the first 500. Download the CSV for the full list.</p>}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
