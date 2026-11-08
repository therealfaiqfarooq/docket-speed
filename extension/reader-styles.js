// Docket Speed: reader styles. Applied inside the reader's Shadow DOM only,
// so nothing here can touch CanLII's page and CanLII's CSS cannot reach in.
// Kept as a JS string because injected scripts cannot <link> a stylesheet into
// a shadow root without exposing it as a web-accessible resource.
//
// Light theme is the default; `.root.dark` switches to dark.
// Tokens (light / dark)
//   --bg       #FFFFFF / #16181D   panel
//   --fg       #0F172A / #ECEEF2   word and primary text
//   --muted    #475569 / #B4BCC8   secondary text (7.6:1 / 9.4:1)
//   --faint    #687387 / #8B93A1   hints, units (4.8:1 / 5.7:1)
//   --line     #E8ECF2 / #2A2E36   hairlines
//   --accent   #E5484D / #FF6B6E   ORP pivot, progress (3.9:1 on white, large text only / 6.4:1)
//   --primary  #0F172A / #ECEEF2   play button

globalThis.DocketSpeedCSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

.root {
  --bg: #ffffff; --fg: #0f172a; --muted: #475569; --faint: #687387; --line: #e8ecf2;
  --hover: #f1f4f8; --accent: #e5484d; --primary: #0f172a; --on-primary: #ffffff;
  --backdrop: rgba(241, 245, 249, 0.72); --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 24px 64px -12px rgba(15, 23, 42, 0.22);
  --focus: #3b82f6; --field: #f6f8fb;
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px; line-height: 1.4; letter-spacing: normal; text-transform: none;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
}
.root.dark {
  --bg: #16181d; --fg: #eceef2; --muted: #b4bcc8; --faint: #8b93a1; --line: #2a2e36;
  --hover: #22252c; --accent: #ff6b6e; --primary: #eceef2; --on-primary: #16181d;
  --backdrop: rgba(8, 10, 14, 0.6); --shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.6);
  --focus: #60a5fa; --field: #1e2127;
}

.backdrop {
  position: fixed; inset: 0; z-index: 2147483646;
  background: var(--backdrop);
  -webkit-backdrop-filter: blur(6px) saturate(1.1); backdrop-filter: blur(6px) saturate(1.1);
  display: flex; align-items: center; justify-content: center;
  padding: 16px; overflow: auto;
  animation: ds-fade 0.18s ease-out;
}
@keyframes ds-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ds-rise { from { opacity: 0; transform: translateY(6px) scale(0.99); } to { opacity: 1; transform: none; } }

.panel {
  width: min(680px, 100%); max-height: 100%; overflow: auto;
  background: var(--bg); color: var(--fg);
  border: 1px solid var(--line); border-radius: 18px;
  box-shadow: var(--shadow);
  animation: ds-rise 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.panel:focus { outline: none; }

.header { display: flex; align-items: center; gap: 12px; padding: 14px 14px 0 20px; }
.mark { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; letter-spacing: 0.01em; color: var(--fg); white-space: nowrap; }
.mark .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.title { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.context {
  display: flex; flex-wrap: wrap; gap: 4px 16px; justify-content: space-between;
  padding: 18px 20px 0; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums;
}
.context .para { color: var(--fg); font-weight: 600; }
.context .quote { font-style: italic; }
.context .meta { display: inline-flex; gap: 8px; }
.context .sep { color: var(--faint); }

.stage { padding: 34px 16px 30px; display: flex; flex-direction: column; align-items: center; }
.tick { width: 1.5px; height: 10px; border-radius: 1px; background: var(--accent); opacity: 0.55; }
.word-row {
  width: 100%;
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: baseline;
  min-height: 1.4em; margin: 10px 0;
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-weight: 450; letter-spacing: -0.015em;
  line-height: 1.15; white-space: pre; overflow: hidden; color: var(--fg);
}
.pre { text-align: right; overflow: hidden; }
.post { text-align: left; overflow: hidden; }
.pivot { color: var(--accent); font-weight: 600; }
.word-row.kind-omitted, .word-row.kind-heading { font-style: italic; color: var(--muted); }

.rail { height: 2px; margin: 0 20px; background: var(--line); border-radius: 2px; overflow: hidden; }
.fill { height: 100%; width: 0; background: var(--fg); opacity: 0.85; transition: width 0.08s linear; }

.controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; padding: 18px 20px 4px; }
.controls.second { justify-content: flex-start; gap: 4px; padding: 12px 14px 0 20px; }
.spacer { flex: 1; }
button, input, select { font: inherit; color: inherit; margin: 0; letter-spacing: normal; text-transform: none; }
.ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 2px;
  height: 34px; min-width: 34px; padding: 0 10px;
  background: transparent; color: var(--muted); border: 0; border-radius: 10px;
  font-size: 12px; font-weight: 500; line-height: 1; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.btn:hover { background: var(--hover); color: var(--fg); }
.btn.icon { padding: 0; }
.btn-label { font-variant-numeric: tabular-nums; }
.btn.primary {
  width: 48px; height: 48px; margin: 0 8px; border-radius: 50%;
  background: var(--primary); color: var(--on-primary);
  box-shadow: 0 6px 16px -6px rgba(15, 23, 42, 0.45);
}
.btn.primary:hover { background: var(--primary); color: var(--on-primary); filter: brightness(1.15); }
.btn.primary .ico { width: 20px; height: 20px; }
.small-a { font-size: 11px; font-weight: 600; }
.big-a { font-size: 16px; font-weight: 600; }
.close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 50%; border: 0; background: transparent;
  color: var(--muted); cursor: pointer;
}
.close:hover { background: var(--hover); color: var(--fg); }
.close .ico { width: 16px; height: 16px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.field { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.field.speed { margin-right: 8px; }
.field .unit { color: var(--faint); margin-left: -4px; }
.field input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 120px; max-width: 28vw; height: 18px; background: transparent; cursor: pointer;
}
.field input[type="range"]::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: var(--line); }
.field input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; margin-top: -5.5px; border-radius: 50%;
  background: var(--bg); border: 1.5px solid var(--fg); box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
}
.field input[type="range"]::-moz-range-track { height: 3px; border-radius: 3px; background: var(--line); }
.field input[type="range"]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--bg); border: 1.5px solid var(--fg); }
.field.goto { margin-left: 6px; }
.field input[type="number"] {
  width: 4.5em; height: 30px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--field); color: var(--fg); font-variant-numeric: tabular-nums;
}
.field input[type="number"]::placeholder { color: var(--faint); }
.num { color: var(--fg); font-weight: 600; min-width: 3ch; display: inline-block; text-align: right; font-variant-numeric: tabular-nums; }

.footer {
  display: flex; flex-wrap: wrap; gap: 6px 16px; justify-content: space-between;
  margin-top: 14px; padding: 12px 20px 14px; border-top: 1px solid var(--line);
  font-size: 11px; color: var(--faint); font-variant-numeric: tabular-nums;
}
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.toast {
  position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
  z-index: 2147483646; max-width: min(440px, calc(100vw - 32px));
  background: #ffffff; color: #0f172a; border: 1px solid #e8ecf2; border-radius: 14px;
  padding: 12px 16px 12px 14px; font-size: 13px; line-height: 1.45;
  display: flex; gap: 10px; align-items: flex-start;
  box-shadow: 0 16px 40px -12px rgba(15, 23, 42, 0.25);
  animation: ds-rise 0.2s ease-out;
}
.toast::before { content: ""; flex: none; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: #e5484d; }

@media (prefers-reduced-motion: reduce) {
  .backdrop, .panel, .toast { animation: none; }
  .fill { transition: none; }
}
@media (max-width: 560px) {
  .stage { padding: 22px 8px 18px; }
  .controls, .footer, .context { padding-left: 12px; padding-right: 12px; }
  .controls.second { padding-left: 12px; }
  .controls.second .spacer { display: none; }
}
`;
