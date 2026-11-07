// Tiny local SMTP server for tests: accepts any mail on a local port and lets tests read sign-in codes.
// This is a real SMTP endpoint, so the app's normal nodemailer path is exercised end to end.
import { SMTPServer } from 'smtp-server';

export function startMailSink(port = 2525) {
  const inbox = []; // { to, text }
  const server = new SMTPServer({
    authOptional: true,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth: (_auth, _session, cb) => cb(null, { user: 'sink' }),
    onData(stream, session, cb) {
      let raw = '';
      stream.on('data', (c) => (raw += c));
      stream.on('end', () => {
        const to = session.envelope.rcptTo.map((r) => r.address.toLowerCase());
        inbox.push({ to, raw });
        if (process.env.SINK_PRINT === '1') console.log(`mail to ${to.join(',')}: code ${raw.match(/code is (\d{6})/)?.[1] ?? '-'}`);
        cb();
      });
    },
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({
        close: () => server.close(),
        /** Latest 6-digit code mailed to `email`, waiting up to ~5 s for delivery. */
        async codeFor(email, since = 0) {
          for (let i = 0; i < 50; i++) {
            const m = [...inbox].reverse().find((x, idx) => x.to.includes(email.toLowerCase()) && inbox.length - idx > since);
            const code = m?.raw.match(/code is (\d{6})/)?.[1];
            if (code) return code;
            await new Promise((r) => setTimeout(r, 100));
          }
          return null;
        },
        count: () => inbox.length,
      })
    )
  );
}

if (process.argv[1]?.endsWith('mail-sink.mjs')) {
  await startMailSink(Number(process.env.SINK_PORT || 2525));
  console.log('Mail sink listening on 127.0.0.1:2525');
}
