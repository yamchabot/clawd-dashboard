/**
 * Built-in preset widgets for the clawd-dashboard.
 * Each preset has widget code (plain JS, no JSX, no transpilation).
 * Globals available in widget code: React, useState, useEffect, useMemo,
 * useCallback, useRef, fetch, exec(cmd), console.
 */

export interface PresetDef {
  id: string
  title: string
  description: string
  icon: string
  size: 'sm' | 'md' | 'lg' | 'xl'
  code: string
}

export const PRESET_WIDGETS: PresetDef[] = [
  // ── Digital Clock ──────────────────────────────────────────────────────────
  {
    id: 'preset-clock',
    title: 'Digital Clock',
    description: 'Live clock with date display',
    icon: '🕐',
    size: 'sm',
    code: `
function Widget() {
  const [t, setT] = React.useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = n => String(n).padStart(2, '0');
  const time = p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
  const date = t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return React.createElement('div', { style: { textAlign: 'center', padding: '12px 8px' } },
    React.createElement('div', {
      style: {
        fontSize: '30px', fontFamily: 'var(--mono)', fontWeight: 700,
        color: 'var(--accent-bright)', letterSpacing: '3px', lineHeight: 1
      }
    }, time),
    React.createElement('div', {
      style: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }
    }, date)
  );
}
`.trim(),
  },

  // ── Weather ────────────────────────────────────────────────────────────────
  {
    id: 'preset-weather',
    title: 'Weather',
    description: 'Current conditions via wttr.in',
    icon: '🌤',
    size: 'md',
    code: `
function Widget() {
  const [d, setD] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const load = () => {
    setErr(null);
    fetch('https://wttr.in/?format=j1')
      .then(r => r.json())
      .then(j => {
        const c = j.current_condition[0];
        const area = j.nearest_area[0];
        setD({
          temp: c.temp_F + '\\u00b0F',
          desc: c.weatherDesc[0].value,
          feels: c.FeelsLikeF + '\\u00b0F',
          humidity: c.humidity + '%',
          loc: area.areaName[0].value + ', ' + area.region[0].value
        });
      })
      .catch(() => setErr('Could not load weather'));
  };
  useEffect(() => { load(); }, []);
  if (err) return React.createElement('div', {
    style: { padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }
  },
    React.createElement('div', { style: { color: 'var(--red)', fontSize: '12px' } }, err),
    React.createElement('button', {
      onClick: load,
      style: { padding: '3px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', alignSelf: 'flex-start' }
    }, '\\u21bb Retry')
  );
  if (!d) return React.createElement('div', { style: { padding: '8px', color: 'var(--text-muted)', fontSize: '12px' } }, 'Loading weather...');
  return React.createElement('div', { style: { padding: '4px 0' } },
    React.createElement('div', { style: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' } }, '\\ud83d\\udccd ' + d.loc),
    React.createElement('div', { style: { fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 } }, d.temp),
    React.createElement('div', { style: { fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 8px' } }, d.desc),
    React.createElement('div', { style: { display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--text-muted)' } },
      React.createElement('span', null, 'Feels ' + d.feels),
      React.createElement('span', null, d.humidity + ' humidity')
    )
  );
}
`.trim(),
  },

  // ── Quick Notes ─────────────────────────────────────────────────────────────
  {
    id: 'preset-notes',
    title: 'Quick Notes',
    description: 'Scratch pad that saves locally',
    icon: '📝',
    size: 'md',
    code: `
function Widget() {
  const KEY = 'oc-widget-quicknotes';
  const [text, setText] = React.useState(() => localStorage.getItem(KEY) || '');
  const onChange = e => {
    setText(e.target.value);
    localStorage.setItem(KEY, e.target.value);
  };
  return React.createElement('div', null,
    React.createElement('textarea', {
      value: text,
      onChange,
      placeholder: 'Type notes here...',
      style: {
        width: '100%', minHeight: '90px', resize: 'vertical',
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: '4px', padding: '8px', color: 'var(--text-primary)',
        fontFamily: 'var(--sans)', fontSize: '12px', lineHeight: 1.5,
        outline: 'none'
      }
    }),
    React.createElement('div', {
      style: { fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '3px' }
    }, text.length + ' chars')
  );
}
`.trim(),
  },

  // ── Countdown Timer ────────────────────────────────────────────────────────
  {
    id: 'preset-timer',
    title: 'Countdown Timer',
    description: 'Set a timer in minutes',
    icon: '⏱',
    size: 'sm',
    code: `
function Widget() {
  const [secs, setSecs] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [input, setInput] = React.useState('5');
  const [done, setDone] = React.useState(false);
  useEffect(() => {
    if (!running) return;
    if (secs <= 0) { setRunning(false); setDone(true); return; }
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, secs]);
  const start = () => {
    const s = Math.max(1, parseInt(input) || 1) * 60;
    setSecs(s); setRunning(true); setDone(false);
  };
  const m = Math.floor(secs / 60), s = secs % 60;
  const disp = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  const isUrgent = secs > 0 && secs <= 60;
  return React.createElement('div', { style: { textAlign: 'center', padding: '8px 0' } },
    done
      ? React.createElement('div', { style: { fontSize: '20px', color: 'var(--green)', marginBottom: '12px' } }, '\\u2713 Time\\u2019s up!')
      : React.createElement('div', {
          style: {
            fontSize: '36px', fontFamily: 'var(--mono)', fontWeight: 700, lineHeight: 1, marginBottom: '12px',
            color: isUrgent ? 'var(--red)' : 'var(--accent-bright)'
          }
        }, disp),
    running
      ? React.createElement('button', {
          onClick: () => setRunning(false),
          style: { padding: '5px 16px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '12px' }
        }, '\\u23f8 Pause')
      : React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' } },
          React.createElement('input', {
            type: 'number', value: input, min: 1, max: 180,
            onChange: e => setInput(e.target.value),
            style: { width: '50px', padding: '5px', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', fontFamily: 'var(--mono)', fontSize: '14px', outline: 'none' }
          }),
          React.createElement('span', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, 'min'),
          React.createElement('button', {
            onClick: start,
            style: { padding: '5px 14px', borderRadius: '4px', border: '1px solid var(--accent-dim)', background: 'var(--accent-glow)', color: 'var(--accent-bright)', cursor: 'pointer', fontSize: '12px' }
          }, '\\u25b6 Start'),
          secs > 0 ? React.createElement('button', {
            onClick: () => { setSecs(0); setDone(false); },
            style: { padding: '5px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }
          }, '\\u21ba') : null
        )
  );
}
`.trim(),
  },

  // ── System Info ────────────────────────────────────────────────────────────
  {
    id: 'preset-sysinfo',
    title: 'System Info',
    description: 'Sandbox uptime and disk usage',
    icon: '💻',
    size: 'sm',
    code: `
function Widget() {
  const [info, setInfo] = React.useState(null);
  const load = async () => {
    setInfo(null);
    try {
      const [up, disk, mem] = await Promise.all([
        exec('uptime'),
        exec('df -h / | tail -1'),
        exec('free -h 2>/dev/null | grep Mem || echo "n/a"')
      ]);
      const uptimeLine = up.stdout.replace(/^.*?up\\s+/, '').replace(/,\\s*\\d+ user.*/, '').trim();
      const diskParts = disk.stdout.trim().split(/\\s+/);
      const memLine = mem.stdout.trim().split(/\\s+/).slice(0, 4).join(' ');
      setInfo({ uptime: uptimeLine, disk: (diskParts[2] || '?') + ' / ' + (diskParts[1] || '?'), mem: memLine });
    } catch(e) {
      setInfo({ uptime: 'n/a', disk: 'n/a', mem: 'n/a' });
    }
  };
  useEffect(() => { load(); }, []);
  if (!info) return React.createElement('div', { style: { padding: '8px', fontSize: '12px', color: 'var(--text-muted)' } }, 'Loading...');
  const Row = (lbl, val) => React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' } },
    React.createElement('span', { style: { color: 'var(--text-muted)' } }, lbl),
    React.createElement('span', { style: { fontFamily: 'var(--mono)', color: 'var(--text-primary)', fontSize: '11px' } }, val)
  );
  return React.createElement('div', null,
    Row('uptime', info.uptime),
    Row('disk /', info.disk),
    Row('memory', info.mem),
    React.createElement('button', {
      onClick: load,
      style: { marginTop: '6px', padding: '3px 8px', fontSize: '10px', border: '1px solid var(--border)', borderRadius: '3px', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }
    }, '\\u21bb Refresh')
  );
}
`.trim(),
  },

  // ── Random Joke ────────────────────────────────────────────────────────────
  {
    id: 'preset-joke',
    title: 'Random Joke',
    description: 'A little levity for your day',
    icon: '😄',
    size: 'md',
    code: `
function Widget() {
  const [joke, setJoke] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const load = () => {
    setLoading(true);
    fetch('https://official-joke-api.appspot.com/random_joke')
      .then(r => r.json())
      .then(j => { setJoke(j); setLoading(false); })
      .catch(() => {
        setJoke({ setup: 'Why do programmers prefer dark mode?', punchline: 'Because light attracts bugs!' });
        setLoading(false);
      });
  };
  useEffect(() => { load(); }, []);
  if (loading || !joke) return React.createElement('div', { style: { padding: '12px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' } }, 'Loading...');
  return React.createElement('div', { style: { padding: '4px 0' } },
    React.createElement('div', { style: { fontSize: '13px', color: 'var(--text-primary)', marginBottom: '10px', lineHeight: 1.6 } }, joke.setup),
    React.createElement('div', {
      style: { fontSize: '13px', color: 'var(--accent-bright)', fontStyle: 'italic', lineHeight: 1.6, borderLeft: '2px solid var(--accent-dim)', paddingLeft: '10px' }
    }, joke.punchline),
    React.createElement('button', {
      onClick: load,
      style: { marginTop: '10px', padding: '4px 12px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }
    }, 'Next joke \\u2192')
  );
}
`.trim(),
  },
]
