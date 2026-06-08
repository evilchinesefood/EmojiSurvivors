// Boot placeholder (M0): register the service worker, paint a blank arena, show
// a Play button. The real boot (sim + renderer + input + UI shell + rAF loop)
// lands in M1 and replaces this file's body.

if ("serviceWorker" in navigator) {
  addEventListener("load", () =>
    navigator.serviceWorker.register("./ServiceWorker.js").catch(() => {}),
  );
}

const canvas = document.getElementById("Game");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

function paint() {
  ctx.fillStyle = "#0e0b14";
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.strokeStyle = "rgba(120,90,160,0.12)";
  ctx.lineWidth = 1;
  const g = 48;
  for (let x = 0; x < innerWidth; x += g) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, innerHeight);
    ctx.stroke();
  }
  for (let y = 0; y < innerHeight; y += g) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(innerWidth, y);
    ctx.stroke();
  }
}
paint();

const overlay = document.getElementById("Overlay");
overlay.innerHTML = `
  <div class="screen">
    <div class="title title-xl"><span class="em">💀</span> EmojiSurvivors</div>
    <div class="subtitle">scaffold build</div>
    <div class="menu-actions">
      <wa-button id="Play" variant="brand" size="l">Play</wa-button>
    </div>
  </div>`;
overlay.querySelector("#Play")?.addEventListener("click", () => {
  // Wired up in M1.
  console.log("Play — coming in M1");
});
