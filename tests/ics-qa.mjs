
import { parseIcs, buildIcs, expandToInstances } from '../.test-build/ics.mjs';

let fail = 0;
const check = (name, ok, detail = '') =>
  console.log(`${ok ? '  ✓' : '✗ FAIL'} ${name}${ok ? '' : `  → ${detail}`}`);
const expect = (name, ok, detail = '') => { if (!ok) fail++; check(name, ok, detail); };

const wrap = (vevent) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//x//EN\r\n${vevent}\r\nEND:VCALENDAR\r\n`;

// ---------- probe 1: what does CREATED round-trip as? ----------
{
  const ics = wrap(`BEGIN:VEVENT\r\nUID:p1\r\nDTSTAMP:20260601T000000Z\r\nCREATED:20250101T120000Z\r\nDTSTART:20260615T100000Z\r\nDTEND:20260615T110000Z\r\nSUMMARY:probe\r\nEND:VEVENT`);
  const parsed = parseIcs(ics);
  const rebuilt = buildIcs(parsed.master, parsed.overrides);
  const createdLine = rebuilt.split('\r\n').find((l) => l.startsWith('CREATED'));
  console.log('  CREATED emitted as:', JSON.stringify(createdLine));
  expect('CREATED is valid ICS DATE-TIME (no dashes/colons)', /^CREATED:[0-9]{8}T[0-9]{6}Z?$/.test(createdLine ?? ''), createdLine);
}

// ---------- probe 2: all-day recurring with UNTIL ----------
{
  const ics = wrap(`BEGIN:VEVENT\r\nUID:p2\r\nDTSTAMP:20260601T000000Z\r\nDTSTART;VALUE=DATE:20260601\r\nDTEND;VALUE=DATE:20260602\r\nRRULE:FREQ=DAILY;UNTIL=20260610\r\nSUMMARY:allday\r\nEND:VEVENT`);
  const parsed = parseIcs(ics);
  const rebuilt = buildIcs(parsed.master, parsed.overrides);
  const rruleLine = rebuilt.split('\r\n').find((l) => l.startsWith('RRULE'));
  console.log('  RRULE emitted as:', JSON.stringify(rruleLine));
  // RFC 5545: UNTIL must be DATE when DTSTART is DATE.
  expect('all-day UNTIL stays a DATE', /UNTIL=\d{8}(;|$)/.test(rruleLine ?? ''), rruleLine);
  // and ical.js must be able to re-iterate the rebuilt rule
  try {
    const re = parseIcs(rebuilt);
    const inst = expandToInstances(re, 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,6,1));
    expect('rebuilt all-day series still expands (10 days)', inst.length === 10, `got ${inst.length}`);
  } catch (e) { expect('rebuilt all-day series still expands', false, e.message); }
}

// ---------- probe 3: BYSETPOS / unmodeled RRULE parts survive a rebuild ----------
{
  const ics = wrap(`BEGIN:VEVENT\r\nUID:p3\r\nDTSTAMP:20260601T000000Z\r\nDTSTART;TZID=Europe/Berlin:20260129T090000\r\nDTEND;TZID=Europe/Berlin:20260129T100000\r\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1\r\nSUMMARY:last workday\r\nEND:VEVENT`);
  const parsed = parseIcs(ics);
  const rebuilt = buildIcs(parsed.master, parsed.overrides);
  const rruleLine = rebuilt.split('\r\n').find((l) => l.startsWith('RRULE'));
  console.log('  RRULE round-tripped as:', JSON.stringify(rruleLine));
  expect('BYSETPOS survives parse→build', (rruleLine ?? '').includes('BYSETPOS=-1'), rruleLine);
  const a = expandToInstances(parsed, 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,7,1));
  const b = expandToInstances(parseIcs(rebuilt), 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,7,1));
  expect('same instances before/after rebuild', JSON.stringify(a.map(i=>i.start)) === JSON.stringify(b.map(i=>i.start)), `${a.map(i=>i.start)} vs ${b.map(i=>i.start)}`);
}

// ---------- probe 4: old daily event still visible years later ----------
{
  const ics = wrap(`BEGIN:VEVENT\r\nUID:p4\r\nDTSTAMP:20200101T000000Z\r\nDTSTART;TZID=Europe/Berlin:20200106T090000\r\nDTEND;TZID=Europe/Berlin:20200106T091500\r\nRRULE:FREQ=DAILY\r\nSUMMARY:standup\r\nEND:VEVENT`);
  const inst = expandToInstances(parseIcs(ics), 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,6,1));
  expect('daily event from 2020 visible in June 2026 (30 instances)', inst.length === 30, `got ${inst.length}`);
}

// ---------- probe 5: RECURRENCE-ID zone on an override written by us ----------
{
  // master in New York; simulate what updateEvent does for an instance edit
  // from a browser in Berlin: override data carries tzid Europe/Berlin.
  const masterIcs = wrap(`BEGIN:VEVENT\r\nUID:p5\r\nDTSTAMP:20260601T000000Z\r\nDTSTART;TZID=America/New_York:20260601T090000\r\nDTEND;TZID=America/New_York:20260601T100000\r\nRRULE:FREQ=DAILY;COUNT=5\r\nSUMMARY:ny series\r\nEND:VEVENT`);
  const parsed = parseIcs(masterIcs);
  const override = { ...parsed.master, tzid: 'Europe/Berlin', ridTzid: parsed.master.tzid, ridIsDate: parsed.master.allDay,
    startWall: { year: 2026, month: 6, day: 3, hour: 17, minute: 0, second: 0 },
    rrule: null, rruleRaw: null, recurrenceId: '20260603T090000' };
  const rebuilt = buildIcs(parsed.master, [override]);
  const ridLine = rebuilt.split('\r\n').find((l) => l.startsWith('RECURRENCE-ID'));
  console.log('  RECURRENCE-ID emitted as:', JSON.stringify(ridLine));
  expect('override RECURRENCE-ID uses the master zone', (ridLine ?? '').includes('America/New_York'), ridLine);
}

// ---------- probe 6: Google-style UNTIL with time round-trips through edits ----------
{
  const ics = wrap(`BEGIN:VEVENT\r\nUID:p6\r\nDTSTAMP:20260601T000000Z\r\nDTSTART;TZID=Europe/Berlin:20260601T090000\r\nDTEND;TZID=Europe/Berlin:20260601T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20260720T065959Z\r\nSUMMARY:weekly\r\nEND:VEVENT`);
  const parsed = parseIcs(ics);
  const a = expandToInstances(parsed, 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,7,31));
  const b = expandToInstances(parseIcs(buildIcs(parsed.master, [])), 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,7,31));
  expect('UNTIL series keeps same occurrence count after rebuild', a.length === b.length, `${a.length} vs ${b.length}`);
}



// ---------- probe 7 (payload path): drag-move a BYSETPOS series, scope 'all' ----------
// mirrors service.updateEvent: payloadToData + rruleRaw preservation
import { payloadToData, buildRRuleString } from '../.test-build/ics.mjs';
{
  const masterIcs = wrap(`BEGIN:VEVENT\r\nUID:p7\r\nDTSTAMP:20260601T000000Z\r\nDTSTART;TZID=Europe/Berlin:20260129T090000\r\nDTEND;TZID=Europe/Berlin:20260129T100000\r\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1\r\nSUMMARY:last workday\r\nEND:VEVENT`);
  const parsed = parseIcs(masterIcs);
  const master = parsed.master;
  // what the client sends on drag: the lossy parsed rule
  const lossyRule = master.rrule;
  const payload = { calendarId: 'cal', title: 'last workday', allDay: false,
    start: '2026-01-29T10:00', end: '2026-01-29T11:00', timeZone: 'Europe/Berlin',
    description: '', location: '', rrule: lossyRule, alarms: [], attendees: [], status: 'confirmed' };
  const next = payloadToData(payload, master.uid, { sequence: master.sequence + 1, created: master.created, organizer: null });
  // the service-layer preservation rule:
  if (next.rrule && master.rruleRaw && JSON.stringify(next.rrule) === JSON.stringify(master.rrule)) {
    next.rruleRaw = master.rruleRaw;
  }
  expect('drag-move keeps BYSETPOS verbatim', next.rruleRaw === 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', next.rruleRaw);
}

// ---------- probe 8 (payload path): all-day weekly with UNTIL, edited via UI ----------
{
  const payload = { calendarId: 'cal', title: 'sprint', allDay: true,
    start: '2026-06-01', end: '2026-06-02', timeZone: 'UTC',
    description: '', location: '',
    rrule: { freq: 'WEEKLY', interval: 1, byDay: ['MO'], until: '2026-07-20' },
    alarms: [], attendees: [], status: 'confirmed' };
  const data = payloadToData(payload, 'p8', {});
  console.log('  all-day RRULE from payload:', data.rruleRaw);
  expect('payload-built all-day UNTIL is DATE form', data.rruleRaw === 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260720', data.rruleRaw);
  const inst = expandToInstances({ master: data, overrides: [], method: null }, 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,7,1));
  expect('expands to 8 Mondays incl. Jul 20', inst.length === 8, `got ${inst.length}: ${inst.map(i=>i.start)}`);
}

// ---------- probe 9: instance-scope move from a different browser zone ----------
{
  const masterIcs = wrap(`BEGIN:VEVENT\r\nUID:p9\r\nDTSTAMP:20260601T000000Z\r\nDTSTART;TZID=America/New_York:20260601T090000\r\nDTEND;TZID=America/New_York:20260601T100000\r\nRRULE:FREQ=DAILY;COUNT=5\r\nSUMMARY:ny series\r\nEND:VEVENT`);
  const parsed = parseIcs(masterIcs);
  const master = parsed.master;
  const payload = { calendarId: 'cal', title: 'ny series', allDay: false,
    start: '2026-06-03T17:00', end: '2026-06-03T18:00', timeZone: 'Europe/Berlin',
    description: '', location: '', rrule: null, alarms: [], attendees: [], status: 'confirmed' };
  const override = payloadToData(payload, master.uid, {
    recurrenceId: '20260603T090000', ridTzid: master.tzid, ridIsDate: master.allDay,
    sequence: master.sequence, organizer: master.organizer
  });
  override.rrule = null; override.rruleRaw = null;
  const rebuilt = buildIcs(master, [override]);
  const ridLine = rebuilt.split('\r\n').find((l) => l.startsWith('RECURRENCE-ID'));
  console.log('  RECURRENCE-ID now:', JSON.stringify(ridLine));
  expect('RECURRENCE-ID carries master zone', (ridLine ?? '').includes('TZID=America/New_York'), ridLine);
  // and the moved instance replaces the original in expansion
  const inst = expandToInstances(parseIcs(rebuilt), 'id', 'cal', Date.UTC(2026,5,1), Date.UTC(2026,5,10));
  const starts = inst.map((i) => i.start);
  expect('5 occurrences total, one moved', inst.length === 5 && starts.includes('2026-06-03T15:00:00.000Z'), starts.join(', '));
}



// ---------- probe 10: a malformed event must not blank its siblings ----------
// Real-world cause of "Could not extract integer" / "invalid date-time":
// ical.js parses EXDATE/RDATE/DURATION/TRIGGER lazily, so a single bad
// property used to throw past parseIcs and fail the whole calendar query.
{
  const badCases = [
    ['bad RDATE',     'RDATE::2'],
    ['bad EXDATE',    'EXDATE:20260105T090000Z,:2'],
    ['bad DURATION',  'DURATION:PT:2H'],
    ['empty COUNT',   'RRULE:FREQ=DAILY;COUNT='],
    ['bad TRIGGER',   'BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT:2M\r\nEND:VALARM']
  ];
  for (const [name, prop] of badCases) {
    const ics = wrap(`BEGIN:VEVENT\r\nUID:bad\r\nDTSTAMP:20260101T000000Z\r\nDTSTART:20260115T090000Z\r\nDTEND:20260115T100000Z\r\nSUMMARY:quirky\r\n${prop}\r\nEND:VEVENT`);
    let parsed, inst;
    try {
      parsed = parseIcs(ics);
      inst = expandToInstances(parsed, 'id', 'cal', Date.UTC(2026,0,1), Date.UTC(2026,1,1));
    } catch (e) {
      expect(`${name}: parseIcs/expand never throws`, false, e.message);
      continue;
    }
    expect(`${name}: parseIcs/expand never throws`, true);
    // The quirky event should still render its base occurrence (Jan 15).
    expect(`${name}: base occurrence still visible`, inst.some((i) => i.start.startsWith('2026-01-15')), JSON.stringify(inst.map(i=>i.start)));
  }
}
console.log(fail ? `\n${fail} probe(s) FAILED` : '\nall probes passed');
process.exit(fail ? 1 : 0);
