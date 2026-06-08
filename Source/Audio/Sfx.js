// WebAudio SFX — synthesized at runtime, zero asset files. The AudioContext is created
// lazily and resumed on the first user gesture (autoplay policy). getVolume() reads the
// live SFX setting; per-type throttling keeps rapid events (kills/gems) from buzzing.
export function makeSfx(getVolume) {
  let ctx = null;
  const last = {};
  const MIN = { kill: 0.045, gem: 0.05, coin: 0.03, hurt: 0.1, damage: 999 };

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(
    freq,
    { type = "square", dur = 0.08, vol = 0.3, slideTo, when = 0 } = {},
  ) {
    const c = ensure();
    const v = getVolume();
    if (!c || v <= 0) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur = 0.12, vol = 0.3, hp = 0) {
    const c = ensure();
    const v = getVolume();
    if (!c || v <= 0) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol * v;
    let node = src;
    if (hp) {
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = hp;
      src.connect(f);
      node = f;
    }
    node.connect(g).connect(c.destination);
    src.start();
  }

  function arp(freqs, step = 0.07, opts = {}) {
    freqs.forEach((f, i) => tone(f, { ...opts, when: i * step }));
  }

  function play(type) {
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const min = MIN[type] || 0;
    if (last[type] && now - last[type] < min) return;
    last[type] = now;
    switch (type) {
      case "kill":
        tone(200, { type: "square", dur: 0.06, vol: 0.12, slideTo: 110 });
        break;
      case "gem":
        tone(840, { type: "sine", dur: 0.05, vol: 0.1, slideTo: 1100 });
        break;
      case "coin":
        tone(1180, { type: "square", dur: 0.05, vol: 0.16, slideTo: 1660 });
        break;
      case "hurt":
        noise(0.14, 0.3, 500);
        tone(150, { type: "sawtooth", dur: 0.14, vol: 0.22, slideTo: 80 });
        break;
      case "levelup":
        arp([523, 659, 784, 1047], 0.07, {
          type: "triangle",
          dur: 0.12,
          vol: 0.22,
        });
        break;
      case "evolve":
        tone(300, { type: "sawtooth", dur: 0.5, vol: 0.25, slideTo: 1400 });
        arp([784, 1047, 1319], 0.09, { type: "triangle", dur: 0.16, vol: 0.2 });
        break;
      case "chest":
        arp([660, 880, 1100], 0.06, { type: "square", dur: 0.1, vol: 0.18 });
        break;
      case "health":
        tone(600, { type: "sine", dur: 0.16, vol: 0.2, slideTo: 980 });
        break;
      case "magnet":
        tone(1200, { type: "sine", dur: 0.22, vol: 0.18, slideTo: 360 });
        break;
      case "boss":
        noise(0.4, 0.4, 80);
        tone(70, { type: "sawtooth", dur: 0.6, vol: 0.3, slideTo: 50 });
        break;
      case "victory":
        arp([523, 659, 784, 1047, 1319], 0.12, {
          type: "triangle",
          dur: 0.22,
          vol: 0.26,
        });
        break;
      case "gameover":
        arp([440, 349, 262, 175], 0.16, {
          type: "sawtooth",
          dur: 0.28,
          vol: 0.26,
        });
        break;
    }
  }

  return { play, unlock: ensure };
}
