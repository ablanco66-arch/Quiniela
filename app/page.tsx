"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "available" | "reserved" | "paid";
type Square = {
  id: number;
  status: Status;
  participant: string;
  contact: string;
  phone: string;
};

type Game = { date: string; visitor: string; home: string };

const games: Game[] = [
  { date: "14 sep", visitor: "Denver Broncos", home: "Kansas City Chiefs" },
  { date: "21 sep", visitor: "New York Giants", home: "Los Angeles Rams" },
  { date: "28 sep", visitor: "Philadelphia Eagles", home: "Chicago Bears" },
  { date: "5 oct", visitor: "Atlanta Falcons", home: "New Orleans Saints" },
  { date: "12 oct", visitor: "Buffalo Bills", home: "Los Angeles Rams" },
  { date: "19 oct", visitor: "Washington Commanders", home: "San Francisco 49ers" },
  { date: "26 oct", visitor: "Dallas Cowboys", home: "Philadelphia Eagles" },
  { date: "2 nov", visitor: "Chicago Bears", home: "Seattle Seahawks" },
  { date: "9 nov", visitor: "Buffalo Bills", home: "Minnesota Vikings" },
  { date: "16 nov", visitor: "Los Angeles Chargers", home: "Baltimore Ravens" },
  { date: "23 nov", visitor: "Cincinnati Bengals", home: "Washington Commanders" },
  { date: "30 nov", visitor: "Carolina Panthers", home: "Tampa Bay Buccaneers" },
  { date: "7 dic", visitor: "Dallas Cowboys", home: "Seattle Seahawks" },
  { date: "14 dic", visitor: "Pittsburgh Steelers", home: "Jacksonville Jaguars" },
  { date: "21 dic", visitor: "New England Patriots", home: "Kansas City Chiefs" },
  { date: "28 dic", visitor: "New York Giants", home: "Detroit Lions" },
  { date: "4 ene", visitor: "Houston Texans", home: "Green Bay Packers" },
];

const emptySquares: Square[] = Array.from({ length: 100 }, (_, index) => ({
  id: index + 1,
  status: "available",
  participant: "",
  contact: "",
  phone: "",
}));

export default function Home() {
  const [squares, setSquares] = useState<Square[]>(emptySquares);
  const [visitorDigits, setVisitorDigits] = useState("");
  const [homeDigits, setHomeDigits] = useState("");
  const [tab, setTab] = useState<"board" | "games" | "rules">("board");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Square | null>(null);
  const [showDigits, setShowDigits] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadBoard() {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      if (!response.ok) throw new Error("No fue posible cargar el tablero");
      const data = await response.json();
      setSquares(data.squares);
      setVisitorDigits(data.settings.visitorDigits ?? "");
      setHomeDigits(data.settings.homeDigits ?? "");
    } catch {
      setNotice("No pudimos conectar con el tablero. Intenta recargar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBoard();
  }, []);

  const counts = useMemo(
    () => ({
      available: squares.filter((square) => square.status === "available").length,
      reserved: squares.filter((square) => square.status === "reserved").length,
      paid: squares.filter((square) => square.status === "paid").length,
    }),
    [squares],
  );

  async function saveSquare(square: Square) {
    setSaving(true);
    try {
      const response = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "square", ...square }),
      });
      if (!response.ok) throw new Error("No se guardó");
      const data = await response.json();
      setSquares((current) => current.map((item) => (item.id === data.square.id ? data.square : item)));
      setSelected(null);
      setNotice(`Casilla ${square.id} actualizada`);
    } catch {
      setNotice("No se pudo guardar el cambio. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDigits() {
    if ((visitorDigits && !isDigitSet(visitorDigits)) || (homeDigits && !isDigitSet(homeDigits))) {
      setNotice("Usa los dígitos del 0 al 9 una sola vez en cada fila.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "digits", visitorDigits, homeDigits }),
      });
      if (!response.ok) throw new Error("No se guardó");
      setShowDigits(false);
      setNotice("Números de juego actualizados");
    } catch {
      setNotice("No se pudieron guardar los números.");
    } finally {
      setSaving(false);
    }
  }

  const filteredIds = new Set(
    squares.filter((square) => filter === "all" || square.status === filter).map((square) => square.id),
  );

  return (
    <main>
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span>R</span></div>
        <div className="brand-copy">
          <p>Rotary Juárez Concordia</p>
          <h1>Quiniela MNF <span>2026</span></h1>
        </div>
        <div className="season-badge"><span>Temporada</span><strong>14 SEP — 4 ENE</strong></div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Lotería anual pro ayuda</span>
          <h2>Un tablero. <em>17 oportunidades</em> de ganar.</h2>
          <p>Cada casilla apoya proyectos de salud, subvenciones humanitarias y el combate contra la polio.</p>
        </div>
        <div className="hero-stat"><strong>$300</strong><span>USD por juego</span></div>
      </section>

      <nav className="tabs" aria-label="Secciones">
        <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><span>▦</span> Tablero</button>
        <button className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}><span>◷</span> Juegos</button>
        <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}><span>i</span> Reglas</button>
      </nav>

      {notice && <button className="notice" onClick={() => setNotice("")} aria-label="Cerrar aviso">{notice}<span>×</span></button>}

      {tab === "board" && (
        <section className="content board-section">
          <div className="section-heading">
            <div><p className="kicker">100 casillas</p><h3>Elige tu número de la suerte</h3></div>
            <button className="outline-button" onClick={() => setShowDigits(true)}>⚙ Números de juego</button>
          </div>

          <div className="summary-grid">
            <button className={filter === "available" ? "summary active" : "summary"} onClick={() => setFilter(filter === "available" ? "all" : "available")}>
              <span className="dot available"/><div><strong>{counts.available}</strong><small>Disponibles</small></div>
            </button>
            <button className={filter === "reserved" ? "summary active" : "summary"} onClick={() => setFilter(filter === "reserved" ? "all" : "reserved")}>
              <span className="dot reserved"/><div><strong>{counts.reserved}</strong><small>Reservadas</small></div>
            </button>
            <button className={filter === "paid" ? "summary active" : "summary"} onClick={() => setFilter(filter === "paid" ? "all" : "paid")}>
              <span className="dot paid"/><div><strong>{counts.paid}</strong><small>Pagadas</small></div>
            </button>
            <div className="summary raised"><span className="dot goal">$</span><div><strong>${(counts.reserved + counts.paid) * 100}</strong><small>Comprometidos</small></div></div>
          </div>

          <div className="board-card">
            <div className="board-meta">
              <div className="legend"><span><i className="available"/>Disponible</span><span><i className="reserved"/>Reservada</span><span><i className="paid"/>Pagada</span></div>
              <p>Toca una casilla para editarla</p>
            </div>
            {loading ? <div className="loading-grid" aria-label="Cargando tablero">Cargando tablero…</div> : (
              <div className="board-scroll">
                <div className="visitor-label">VISITANTE</div>
                <div className="board-with-axis">
                  <div className="home-label">CASA</div>
                  <div className="grid-shell">
                    <div className="corner-cell">VS</div>
                    {(visitorDigits || "          ").padEnd(10).slice(0, 10).split("").map((digit, index) => <div className="digit top" key={`v-${index}`}>{digit || "?"}</div>)}
                    {(homeDigits || "          ").padEnd(10).slice(0, 10).split("").map((digit, row) => (
                      <div className="row-group" key={`row-${row}`}>
                        <div className="digit side">{digit || "?"}</div>
                        {squares.slice(row * 10, row * 10 + 10).map((square) => (
                          <button
                            key={square.id}
                            className={`square ${square.status} ${filteredIds.has(square.id) ? "" : "dimmed"}`}
                            onClick={() => setSelected(square)}
                            aria-label={`Casilla ${square.id}, ${labelFor(square.status)}${square.participant ? `, ${square.participant}` : ""}`}
                          >
                            <span>{square.id}</span>
                            {square.status !== "available" && <b>{initials(square.participant)}</b>}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="deadline"><span>!</span><div><strong>Fecha límite de pago</strong><p>Las casillas deben cubrirse en su totalidad antes del 14 de septiembre de 2026.</p></div></div>
        </section>
      )}

      {tab === "games" && <Games />}
      {tab === "rules" && <Rules />}

      <footer><div className="mini-mark">R</div><p><strong>Rotary Juárez Concordia</strong><br/>Genera un impacto duradero</p><span>Actualizado 12 julio 2026</span></footer>

      {selected && <SquareModal square={selected} saving={saving} onClose={() => setSelected(null)} onSave={saveSquare} />}
      {showDigits && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDigits(false)}>
          <section className="modal digits-modal" role="dialog" aria-modal="true" aria-labelledby="digits-title">
            <button className="modal-close" onClick={() => setShowDigits(false)} aria-label="Cerrar">×</button>
            <p className="kicker">Inicio de temporada</p><h3 id="digits-title">Números de juego</h3>
            <p className="modal-help">Déjalos vacíos hasta el sorteo. Después, ingresa los 10 dígitos en el orden asignado.</p>
            <label>Columnas — visitante<input value={visitorDigits} onChange={(e) => setVisitorDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 7451029863" /></label>
            <label>Renglones — casa<input value={homeDigits} onChange={(e) => setHomeDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 0294831756" /></label>
            <div className="modal-actions"><button className="secondary" onClick={() => { setVisitorDigits(""); setHomeDigits(""); }}>Limpiar</button><button className="primary" onClick={saveDigits} disabled={saving}>{saving ? "Guardando…" : "Guardar números"}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}

function SquareModal({ square, saving, onClose, onSave }: { square: Square; saving: boolean; onClose: () => void; onSave: (square: Square) => void }) {
  const [draft, setDraft] = useState(square);
  function update(field: keyof Square, value: string) { setDraft((current) => ({ ...current, [field]: value })); }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="square-title">
        <button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button>
        <div className={`modal-number ${draft.status}`}>{draft.id}</div>
        <div><p className="kicker">Administrar casilla</p><h3 id="square-title">Casilla #{draft.id}</h3></div>
        <div className="status-picker" role="group" aria-label="Estado de la casilla">
          {(["available", "reserved", "paid"] as Status[]).map((status) => <button key={status} className={draft.status === status ? `active ${status}` : status} onClick={() => setDraft((current) => ({ ...current, status }))}><i/>{labelFor(status)}</button>)}
        </div>
        {draft.status !== "available" && <>
          <label>Nombre de quien juega<input autoFocus value={draft.participant} onChange={(e) => update("participant", e.target.value)} placeholder="Nombre completo" /></label>
          <label>Contacto / vendedor<input value={draft.contact} onChange={(e) => update("contact", e.target.value)} placeholder="Socio que registró la casilla" /></label>
          <label>Teléfono <span>(opcional)</span><input value={draft.phone} onChange={(e) => update("phone", e.target.value)} inputMode="tel" placeholder="(656) 000 0000" /></label>
        </>}
        <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving || (draft.status !== "available" && !draft.participant.trim())} onClick={() => onSave(draft.status === "available" ? { ...draft, participant: "", contact: "", phone: "" } : draft)}>{saving ? "Guardando…" : "Guardar cambios"}</button></div>
      </section>
    </div>
  );
}

function Games() {
  return <section className="content games-section"><div className="section-heading"><div><p className="kicker">Calendario oficial</p><h3>17 lunes de emoción</h3></div><span className="year-pill">2026–27</span></div><div className="games-list">{games.map((game, index) => <article className="game" key={`${game.date}-${game.visitor}`}><div className="game-number"><span>JUEGO</span><strong>{String(index + 1).padStart(2, "0")}</strong></div><div className="game-date">{game.date}</div><div className="matchup"><div><small>VISITANTE</small><strong>{game.visitor}</strong></div><span>@</span><div><small>CASA</small><strong>{game.home}</strong></div></div><div className="monday">LUN<br/>7:00</div></article>)}</div></section>;
}

function Rules() {
  const rules = [
    ["$100 USD por casilla", "El apoyo debe cubrirse totalmente antes del 14 de septiembre de 2026."],
    ["$300 USD por juego", "Puedes ganar cada vez que tu marcador resulte premiado durante los 17 juegos."],
    ["Los números se revelan al inicio", "Las casillas se eligen al azar. Los dígitos de columnas y renglones permanecen ocultos hasta iniciar la temporada."],
    ["Cuenta el marcador final", "Se consideran tiempos extras y solamente la unidad del resultado de cada equipo."],
  ];
  return <section className="content rules-section"><div className="section-heading"><div><p className="kicker">Cómo se juega</p><h3>Reglas claras, diversión grande</h3></div></div><div className="rules-grid">{rules.map(([title, body], index) => <article key={title}><span>{index + 1}</span><div><h4>{title}</h4><p>{body}</p></div></article>)}</div><div className="example"><span className="example-tag">EJEMPLO</span><h4>Visitante 17 — Casa 10</h4><p>Gana la casilla donde la columna <strong>7</strong> cruza con el renglón <strong>0</strong>.</p><div className="score-example"><div><small>VISITANTE</small><strong>17</strong></div><span>→</span><div className="winning-square"><small>CASILLA</small><strong>7 × 0</strong></div><span>←</span><div><small>CASA</small><strong>10</strong></div></div></div><div className="warnings"><p>Las casillas no pagadas totalmente no juegan.</p><p>Si gana una casilla no vendida, el premio de esa fecha se queda en el club.</p><p>Solo participan los juegos aquí listados.</p></div></section>;
}

function labelFor(status: Status) { return status === "available" ? "Disponible" : status === "reserved" ? "Reservada" : "Pagada"; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function cleanDigits(value: string) { return value.replace(/\D/g, "").slice(0, 10); }
function isDigitSet(value: string) { return value.length === 10 && new Set(value).size === 10 && [...value].every((digit) => "0123456789".includes(digit)); }
