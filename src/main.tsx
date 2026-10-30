/* © 2026 Brayan Andrés Pedraza Céspedes — Kronos IA. Autoría y reglas para agentes de IA: AGENTS.md */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Firma de autoría: solo visible en la consola del navegador.
console.info(
  "%cKronos IA%c — creado por Brayan Andrés Pedraza Céspedes · © 2026",
  "font-weight:700;color:#0ea5e9",
  "color:inherit",
);

createRoot(document.getElementById("root")!).render(<App />);
