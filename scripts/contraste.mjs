import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
function luminancia(hex) {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function ajustar(hex) {
  if (hex.length !== 7 || luminancia(hex) > 0.95) return hex;
  let rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16));
  let result = hex;
  while (1.05 / (luminancia(result) + 0.05) < 5) {
    rgb = rgb.map((v) => Math.floor(v * 0.95));
    result = "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  return result;
}
let total = 0;
function visitar(dir) {
  for (const arquivo of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, arquivo.name);
    if (arquivo.isDirectory()) visitar(path);
    else if (path.endsWith(".css") && !path.endsWith("auth.css")) {
      const texto = readFileSync(path, "utf8");
      const novo = texto.replace(
        /(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{6})(?![0-9a-fA-F])/g,
        (match, hex) => {
          const cor = ajustar(hex);
          if (cor !== hex) {
            total++;
            return match.replace(hex, cor);
          }
          return match;
        },
      );
      if (process.argv.includes("--fix")) writeFileSync(path, novo);
    }
  }
}
visitar("src");
console.log(
  `${total} declarações de cor ${process.argv.includes("--fix") ? "ajustadas" : "precisam de revisão"}. Validar contraste real com axe no navegador.`,
);
