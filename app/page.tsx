"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "available" | "reserved" | "paid";
type Role = "admin" | "user" | "treasury";
type Square = {
  id: number; status: Status; participant: string; contact: string; phone: string;
  reservedByEmail: string; reservedByName: string; reservedAt: string;
  paidByEmail: string; paidByName: string; paidAt: string;
};
type Member = { email: string; name: string; role: Role; active: number };
type Activity = { id: number; squareId: number | null; action: string; actorName: string; actorRole: Role; previousStatus: string; newStatus: string; details: string; createdAt: string };
type Game = { date: string; visitor: string; home: string };

const games: Game[] = [
  { date: "14 sep", visitor: "Denver Broncos", home: "Kansas City Chiefs" }, { date: "21 sep", visitor: "New York Giants", home: "Los Angeles Rams" },
  { date: "28 sep", visitor: "Philadelphia Eagles", home: "Chicago Bears" }, { date: "5 oct", visitor: "Atlanta Falcons", home: "New Orleans Saints" },
  { date: "12 oct", visitor: "Buffalo Bills", home: "Los Angeles Rams" }, { date: "19 oct", visitor: "Washington Commanders", home: "San Francisco 49ers" },
  { date: "26 oct", visitor: "Dallas Cowboys", home: "Philadelphia Eagles" }, { date: "2 nov", visitor: "Chicago Bears", home: "Seattle Seahawks" },
  { date: "9 nov", visitor: "Buffalo Bills", home: "Minnesota Vikings" }, { date: "16 nov", visitor: "Los Angeles Chargers", home: "Baltimore Ravens" },
  { date: "23 nov", visitor: "Cincinnati Bengals", home: "Washington Commanders" }, { date: "30 nov", visitor: "Carolina Panthers", home: "Tampa Bay Buccaneers" },
  { date: "7 dic", visitor: "Dallas Cowboys", home: "Seattle Seahawks" }, { date: "14 dic", visitor: "Pittsburgh Steelers", home: "Jacksonville Jaguars" },
  { date: "21 dic", visitor: "New England Patriots", home: "Kansas City Chiefs" }, { date: "28 dic", visitor: "New York Giants", home: "Detroit Lions" },
  { date: "4 ene", visitor: "Houston Texans", home: "Green Bay Packers" },
];

const emptySquares: Square[] = Array.from({ length: 100 }, (_, index) => ({ id:index + 1, status:"available", participant:"", contact:"", phone:"", reservedByEmail:"", reservedByName:"", reservedAt:"", paidByEmail:"", paidByName:"", paidAt:"" }));

export default function Home() {
  const [squares, setSquares] = useState<Square[]>(emptySquares);
  const [visitorDigits, setVisitorDigits] = useState("");
  const [homeDigits, setHomeDigits] = useState("");
  const [tab, setTab] = useState<"board" | "games" | "rules" | "reports">("board");
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Square | null>(null);
  const [showDigits, setShowDigits] = useState(false);
  const [me, setMe] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [accessState, setAccessState] = useState<"loading" | "ready" | "signin" | "denied">("loading");
  const [accessEmail, setAccessEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadBoard() {
    try {
      const response = await fetch("/api/board", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401) { setAccessState("signin"); return; }
      if (response.status === 403) { setAccessEmail(data.email ?? ""); setAccessState("denied"); return; }
      if (!response.ok) throw new Error(data.error || "No fue posible cargar el tablero");
      setSquares(data.squares); setVisitorDigits(data.settings.visitorDigits ?? ""); setHomeDigits(data.settings.homeDigits ?? "");
      setMe(data.me); setMembers(data.members ?? []); setActivity(data.activity ?? []); setAccessState("ready");
    } catch (error) { setNotice(error instanceof Error ? error.message : "No pudimos conectar con el tablero."); }
  }

  useEffect(() => { loadBoard(); }, []);

  const counts = useMemo(() => ({ available:squares.filter((s) => s.status === "available").length, reserved:squares.filter((s) => s.status === "reserved").length, paid:squares.filter((s) => s.status === "paid").length }), [squares]);
  const report = useMemo(() => {
    const rows = new Map<string, { name:string; reserved:number; paid:number; total:number }>();
    squares.filter((square) => square.status !== "available").forEach((square) => {
      const name = square.reservedByName || square.contact || "Sin asignar";
      const row = rows.get(name) ?? { name, reserved:0, paid:0, total:0 };
      if (square.status === "reserved") row.reserved += 1; else row.paid += 1;
      row.total += 1; rows.set(name, row);
    });
    return [...rows.values()].sort((a,b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [squares]);

  async function put(payload: Record<string, unknown>) {
    const response = await fetch("/api/board", { method:"PUT", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar");
    return data;
  }

  async function saveSquare(square: Square) {
    setSaving(true);
    try {
      const data = await put({ action:"square", ...square });
      setSquares((current) => current.map((item) => item.id === data.square.id ? data.square : item)); setSelected(null);
      setNotice(`Casilla ${square.id} actualizada`); await loadBoard();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo guardar el cambio."); }
    finally { setSaving(false); }
  }

  async function saveDigits() {
    if ((visitorDigits && !isDigitSet(visitorDigits)) || (homeDigits && !isDigitSet(homeDigits))) { setNotice("Usa los dígitos del 0 al 9 una sola vez en cada fila."); return; }
    setSaving(true);
    try { await put({ action:"digits", visitorDigits, homeDigits }); setShowDigits(false); setNotice("Números de juego actualizados"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudieron guardar los números."); }
    finally { setSaving(false); }
  }

  async function saveMember(member: Member) {
    setSaving(true);
    try { const data = await put({ action:"member", ...member, active:Boolean(member.active) }); setMembers(data.members); setNotice(`Acceso de ${member.name} actualizado`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo actualizar el acceso."); }
    finally { setSaving(false); }
  }

  if (accessState !== "ready") return <AccessScreen state={accessState} email={accessEmail} />;
  const filteredIds = new Set(squares.filter((square) => filter === "all" || square.status === filter).map((square) => square.id));

  return <main>
    <header className="topbar">
      <img className="club-logo header-logo" src="/logo-crjc.png" alt="Rotary Juárez Concordia" />
      <div className="brand-copy"><h1>Quiniela MNF <span>2026</span></h1></div>
      <div className="account-chip"><div><strong>{me?.name}</strong><span>{roleLabel(me?.role ?? "user")}</span></div><a href="/signout-with-chatgpt?return_to=%2F" aria-label="Cerrar sesión">Salir</a></div>
    </header>

    <section className="hero"><div><span className="eyebrow">Lotería anual pro ayuda</span><h2>Un tablero. <em>17 oportunidades</em> de ganar.</h2><p>Cada casilla apoya proyectos de salud, subvenciones humanitarias y el combate contra la polio.</p></div><div className="hero-stat"><strong>$300</strong><span>USD por juego</span></div></section>

    <nav className="tabs" aria-label="Secciones">
      <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}><span>▦</span> Tablero</button>
      <button className={tab === "games" ? "active" : ""} onClick={() => setTab("games")}><span>◷</span> Juegos</button>
      <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><span>≡</span> Reportes</button>
      <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}><span>i</span> Reglas</button>
    </nav>

    {notice && <button className="notice" onClick={() => setNotice("")} aria-label="Cerrar aviso">{notice}<span>×</span></button>}

    {tab === "board" && <section className="content board-section">
      <div className="section-heading"><div><p className="kicker">100 casillas</p><h3>Elige tu número de la suerte</h3></div>{me?.role === "admin" && <button className="outline-button" onClick={() => setShowDigits(true)}>⚙ Números de juego</button>}</div>
      <div className="summary-grid">
        <button className={filter === "available" ? "summary active" : "summary"} onClick={() => setFilter(filter === "available" ? "all" : "available")}><span className="dot available"/><div><strong>{counts.available}</strong><small>Disponibles</small></div></button>
        <button className={filter === "reserved" ? "summary active" : "summary"} onClick={() => setFilter(filter === "reserved" ? "all" : "reserved")}><span className="dot reserved"/><div><strong>{counts.reserved}</strong><small>Reservadas</small></div></button>
        <button className={filter === "paid" ? "summary active" : "summary"} onClick={() => setFilter(filter === "paid" ? "all" : "paid")}><span className="dot paid"/><div><strong>{counts.paid}</strong><small>Pagadas</small></div></button>
        <div className="summary raised"><span className="dot goal">$</span><div><strong>${(counts.reserved + counts.paid) * 100}</strong><small>Comprometidos</small></div></div>
      </div>
      <div className="board-card"><div className="board-meta"><div className="legend"><span><i className="available"/>Disponible</span><span><i className="reserved"/>Reservada</span><span><i className="paid"/>Pagada</span></div><p>Toca una casilla para ver sus datos</p></div>
        <div className="board-scroll"><div className="visitor-label">VISITANTE</div><div className="board-with-axis"><div className="home-label">CASA</div><div className="grid-shell">
          <div className="corner-cell">VS</div>{(visitorDigits || "          ").padEnd(10).slice(0,10).split("").map((digit,index) => <div className="digit top" key={`v-${index}`}>{digit || "?"}</div>)}
          {(homeDigits || "          ").padEnd(10).slice(0,10).split("").map((digit,row) => <div className="row-group" key={`row-${row}`}><div className="digit side">{digit || "?"}</div>{squares.slice(row*10,row*10+10).map((square) => <button key={square.id} className={`square ${square.status} ${filteredIds.has(square.id) ? "" : "dimmed"} ${isOwned(square, me!) ? "mine" : ""}`} onClick={() => setSelected(square)} aria-label={`Casilla ${square.id}, ${labelFor(square.status)}${square.participant ? `, ${square.participant}` : ""}`}><span>{square.id}</span>{square.status !== "available" && <b>{initials(square.participant)}</b>}{isOwned(square, me!) && <i className="mine-badge">Mía</i>}</button>)}</div>)}
        </div></div></div>
      </div>
      <div className="permission-note"><span>{roleIcon(me!.role)}</span><div><strong>Acceso: {roleLabel(me!.role)}</strong><p>{roleHelp(me!.role)}</p></div></div>
      <div className="deadline"><span>!</span><div><strong>Fecha límite de pago</strong><p>Las casillas deben cubrirse en su totalidad antes del 14 de septiembre de 2026.</p></div></div>
    </section>}

    {tab === "games" && <Games />}
    {tab === "rules" && <Rules />}
    {tab === "reports" && <Reports rows={report} squares={squares} activity={activity} me={me!} members={members} saving={saving} onSaveMember={saveMember} />}

    <footer><div className="footer-logo-wrap"><img className="club-logo footer-logo" src="/logo-crjc.png" alt="Rotary Juárez Concordia" /></div><p>Genera un impacto duradero</p><span>Actualizado 13 julio 2026</span></footer>

    {selected && <SquareModal square={selected} me={me!} members={members} saving={saving} onClose={() => setSelected(null)} onSave={saveSquare} />}
    {showDigits && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowDigits(false)}><section className="modal digits-modal" role="dialog" aria-modal="true" aria-labelledby="digits-title"><button className="modal-close" onClick={() => setShowDigits(false)} aria-label="Cerrar">×</button><p className="kicker">Inicio de temporada</p><h3 id="digits-title">Números de juego</h3><p className="modal-help">Déjalos vacíos hasta el sorteo. Después, ingresa los 10 dígitos en el orden asignado.</p><label>Columnas — visitante<input value={visitorDigits} onChange={(e) => setVisitorDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 7451029863" /></label><label>Renglones — casa<input value={homeDigits} onChange={(e) => setHomeDigits(cleanDigits(e.target.value))} inputMode="numeric" maxLength={10} placeholder="Ej. 0294831756" /></label><div className="modal-actions"><button className="secondary" onClick={() => {setVisitorDigits("");setHomeDigits("");}}>Limpiar</button><button className="primary" onClick={saveDigits} disabled={saving}>{saving ? "Guardando…" : "Guardar números"}</button></div></section></div>}
  </main>;
}

function AccessScreen({ state, email }:{ state:"loading"|"signin"|"denied"; email:string }) {
  return <main className="access-screen"><div className="access-card"><img src="/logo-crjc.png" alt="Rotary Juárez Concordia"/><p className="kicker">Quiniela MNF 2026</p>{state === "loading" ? <><h1>Preparando tu tablero</h1><div className="access-loader"/></> : state === "signin" ? <><h1>Identifica tu acceso</h1><p>Inicia sesión para consultar el tablero y aplicar los permisos de tu rol.</p><a className="access-button" href="/signin-with-chatgpt?return_to=%2F">Iniciar sesión con ChatGPT</a></> : <><h1>Acceso pendiente</h1><p>La cuenta <strong>{email || "actual"}</strong> todavía no está registrada. Pide al administrador que te agregue desde Reportes → Accesos.</p><a className="access-button secondary-link" href="/signout-with-chatgpt?return_to=%2F">Usar otra cuenta</a></>}</div></main>;
}

function SquareModal({ square, me, members, saving, onClose, onSave }:{ square:Square; me:Member; members:Member[]; saving:boolean; onClose:()=>void; onSave:(square:Square)=>void }) {
  const [draft,setDraft] = useState(square);
  const owns = isOwned(square,me); const admin = me.role === "admin"; const treasuryOther = me.role === "treasury" && square.status === "reserved" && !owns;
  const editableDetails = admin || owns || square.status === "available";
  const statuses = (["available","reserved","paid"] as Status[]);
  const allowed = (status:Status) => admin || (square.status === "available" && status === "reserved") || (owns && square.status === "reserved" && (status === "reserved" || status === "paid")) || (owns && square.status === "paid" && status === "paid") || (treasuryOther && status === "paid");
  const canSave = admin || allowed(draft.status);
  function update(field:keyof Square,value:string){ setDraft((current) => ({...current,[field]:value})); }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="square-title"><button className="modal-close" onClick={onClose} aria-label="Cerrar">×</button><div className={`modal-number ${draft.status}`}>{draft.id}</div><div><p className="kicker">Detalle de casilla</p><h3 id="square-title">Casilla #{draft.id}</h3></div>
    <div className="status-picker" role="group" aria-label="Estado de la casilla">{statuses.map((status) => <button key={status} disabled={!allowed(status)} className={draft.status === status ? `active ${status}` : status} onClick={() => setDraft((current) => ({...current,status}))}><i/>{labelFor(status)}</button>)}</div>
    {draft.status !== "available" && <>{editableDetails ? <><label>Nombre de quien juega<input autoFocus value={draft.participant} onChange={(e) => update("participant",e.target.value)} placeholder="Nombre completo"/></label><label>Teléfono <span>(opcional)</span><input value={draft.phone} onChange={(e) => update("phone",e.target.value)} inputMode="tel" placeholder="(656) 000 0000"/></label></> : <div className="readonly-data"><small>JUGADOR</small><strong>{draft.participant}</strong>{draft.phone && <span>{draft.phone}</span>}</div>}
      {admin ? <><label>Socio que la vendió<input list="member-names" value={draft.reservedByName} onChange={(e) => update("reservedByName",e.target.value)} placeholder="Nombre del socio"/></label><label>Correo del socio <span>(opcional para registros anteriores)</span><input value={draft.reservedByEmail} onChange={(e) => update("reservedByEmail",e.target.value)} type="email" placeholder="socio@correo.com"/></label><datalist id="member-names">{members.map((member) => <option key={member.email} value={member.name}/>)}</datalist></> : <div className="ownership"><span>Vendida por</span><strong>{draft.reservedByName || (square.status === "available" ? me.name : "Sin asignar")}</strong></div>}
      {draft.status === "paid" && <div className="payment-proof"><span>Pago confirmado por</span><strong>{draft.paidByName || "Se registrará al guardar"}</strong></div>}
    </>}
    {!canSave && <p className="locked-message">Esta casilla fue vendida por otro socio. Puedes consultar sus datos, pero no modificarlos.</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cerrar</button>{canSave && <button className="primary" disabled={saving || (draft.status !== "available" && !draft.participant.trim())} onClick={() => onSave(draft)}>{saving ? "Guardando…" : treasuryOther ? "Confirmar pago" : "Guardar cambios"}</button>}</div>
  </section></div>;
}

function Reports({ rows, squares, activity, me, members, saving, onSaveMember }:{ rows:{name:string;reserved:number;paid:number;total:number}[]; squares:Square[]; activity:Activity[]; me:Member; members:Member[]; saving:boolean; onSaveMember:(member:Member)=>void }) {
  const [reportView,setReportView] = useState<"summary"|"activity"|"access">("summary");
  const [draft,setDraft] = useState<Member>({email:"",name:"",role:"user",active:1});
  const totals = { reserved:rows.reduce((n,row)=>n+row.reserved,0), paid:rows.reduce((n,row)=>n+row.paid,0), total:rows.reduce((n,row)=>n+row.total,0) };
  return <section className="content reports-section"><div className="section-heading"><div><p className="kicker">Control y seguimiento</p><h3>Reportes</h3></div><span className="year-pill">{squares.filter((s)=>s.status!=="available").length} vendidas</span></div>
    <div className="report-switch"><button className={reportView==="summary"?"active":""} onClick={()=>setReportView("summary")}>Sumario por socio</button><button className={reportView==="activity"?"active":""} onClick={()=>setReportView("activity")}>Actividad</button>{me.role==="admin"&&<button className={reportView==="access"?"active":""} onClick={()=>setReportView("access")}>Accesos</button>}</div>
    {reportView === "summary" && <div className="report-card"><div className="report-card-head"><div><h4>Casillas reservadas y pagadas por socio</h4><p>Las casillas se atribuyen al socio que realizó la venta.</p></div><div className="report-value"><strong>${totals.paid*100}</strong><span>cobrado</span></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Socio</th><th>Reservada</th><th>Pagada</th><th>Total</th></tr></thead><tbody>{rows.map((row)=><tr key={row.name}><td>{row.name}</td><td>{row.reserved || ""}</td><td>{row.paid || ""}</td><td><strong>{row.total}</strong></td></tr>)}</tbody><tfoot><tr><td>Total general</td><td>{totals.reserved}</td><td>{totals.paid}</td><td>{totals.total}</td></tr></tfoot></table></div></div>}
    {reportView === "activity" && <div className="report-card"><div className="report-card-head"><div><h4>Actividad reciente</h4><p>Quién reservó, cobró o modificó cada casilla.</p></div></div><div className="activity-list">{activity.length ? activity.map((item)=><article key={item.id}><span className={`activity-icon ${item.action}`}>{activityIcon(item.action)}</span><div><strong>{item.actorName}</strong><p>{activityText(item)}</p><small>{formatDate(item.createdAt)} · {roleLabel(item.actorRole)}</small></div>{item.squareId&&<b>#{item.squareId}</b>}</article>) : <p className="empty-report">La actividad nueva aparecerá aquí.</p>}</div></div>}
    {reportView === "access" && <div className="access-management"><div className="member-form report-card"><div className="report-card-head"><div><h4>Agregar o actualizar acceso</h4><p>El correo debe coincidir con la cuenta de ChatGPT del socio.</p></div></div><div className="member-form-grid"><label>Nombre<input value={draft.name} onChange={(e)=>setDraft({...draft,name:e.target.value})} placeholder="Nombre del socio"/></label><label>Correo<input value={draft.email} onChange={(e)=>setDraft({...draft,email:e.target.value})} type="email" placeholder="socio@correo.com"/></label><label>Nivel<select value={draft.role} onChange={(e)=>setDraft({...draft,role:e.target.value as Role})}><option value="user">Usuario</option><option value="treasury">Tesorería</option><option value="admin">Administrador</option></select></label></div><button className="primary member-save" disabled={saving||!draft.name||!draft.email} onClick={()=>{onSaveMember(draft);setDraft({email:"",name:"",role:"user",active:1});}}>{saving?"Guardando…":"Guardar acceso"}</button></div>
      <div className="report-card member-list"><div className="report-card-head"><div><h4>Personas autorizadas</h4><p>{members.filter((member)=>member.active).length} accesos activos</p></div></div>{members.map((member)=><article key={member.email}><div><strong>{member.name}</strong><span>{member.email}</span></div><select value={member.role} onChange={(e)=>onSaveMember({...member,role:e.target.value as Role})} disabled={member.email===me.email}><option value="user">Usuario</option><option value="treasury">Tesorería</option><option value="admin">Administrador</option></select><button className={member.active?"member-active":"member-inactive"} disabled={member.email===me.email} onClick={()=>onSaveMember({...member,active:member.active?0:1})}>{member.active?"Activo":"Inactivo"}</button></article>)}</div>
    </div>}
  </section>;
}

function Games(){ return <section className="content games-section"><div className="section-heading"><div><p className="kicker">Calendario oficial</p><h3>17 lunes de emoción</h3></div><span className="year-pill">2026–27</span></div><div className="games-list">{games.map((game,index)=><article className="game" key={`${game.date}-${game.visitor}`}><div className="game-number"><span>JUEGO</span><strong>{String(index+1).padStart(2,"0")}</strong></div><div className="game-date">{game.date}</div><div className="matchup"><div><small>VISITANTE</small><strong>{game.visitor}</strong></div><span>@</span><div><small>CASA</small><strong>{game.home}</strong></div></div><div className="monday">LUN<br/>7:00</div></article>)}</div></section>; }

function Rules(){ const rules=[["$100 USD por casilla","El apoyo debe cubrirse totalmente antes del 14 de septiembre de 2026."],["$300 USD por juego","Puedes ganar cada vez que tu marcador resulte premiado durante los 17 juegos."],["Los números se revelan al inicio","Las casillas se eligen al azar. Los dígitos permanecen ocultos hasta iniciar la temporada."],["Cuenta el marcador final","Se consideran tiempos extras y solamente la unidad del resultado de cada equipo."]]; return <section className="content rules-section"><div className="section-heading"><div><p className="kicker">Cómo se juega</p><h3>Reglas claras, diversión grande</h3></div></div><div className="rules-grid">{rules.map(([title,body],index)=><article key={title}><span>{index+1}</span><div><h4>{title}</h4><p>{body}</p></div></article>)}</div><div className="example"><span className="example-tag">EJEMPLO</span><h4>Visitante 17 — Casa 10</h4><p>Gana la casilla donde la columna <strong>7</strong> cruza con el renglón <strong>0</strong>.</p><div className="score-example"><div><small>VISITANTE</small><strong>17</strong></div><span>→</span><div className="winning-square"><small>CASILLA</small><strong>7 × 0</strong></div><span>←</span><div><small>CASA</small><strong>10</strong></div></div></div><div className="warnings"><p>Las casillas no pagadas totalmente no juegan.</p><p>Si gana una casilla no vendida, el premio se queda en el club.</p><p>Solo participan los juegos aquí listados.</p></div></section>; }

function isOwned(square:Square,me:Member){ return Boolean(square.reservedByEmail) && square.reservedByEmail.toLowerCase()===me.email.toLowerCase(); }
function labelFor(status:Status){ return status==="available"?"Disponible":status==="reserved"?"Reservada":"Pagada"; }
function roleLabel(role:Role){ return role==="admin"?"Administrador":role==="treasury"?"Tesorería":"Usuario"; }
function roleIcon(role:Role){ return role==="admin"?"A":role==="treasury"?"T":"U"; }
function roleHelp(role:Role){ return role==="admin"?"Puedes modificar cualquier dato, administrar accesos y configurar los números.":role==="treasury"?"Puedes reservar casillas y confirmar el pago de cualquier reservación.":"Puedes reservar casillas y confirmar el pago únicamente de las que tú vendiste."; }
function initials(name:string){ return name.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]).join("").toUpperCase(); }
function cleanDigits(value:string){ return value.replace(/\D/g,"").slice(0,10); }
function isDigitSet(value:string){ return value.length===10&&new Set(value).size===10&&[...value].every((digit)=>"0123456789".includes(digit)); }
function activityIcon(action:string){ return action==="paid"?"$":action==="reserved"?"R":action==="released"?"↺":"·"; }
function activityText(item:Activity){ if(item.action==="paid")return `marcó como pagada la casilla ${item.squareId}`;if(item.action==="reserved")return `reservó la casilla ${item.squareId} para ${item.details}`;if(item.action==="released")return `liberó la casilla ${item.squareId}`;if(item.action==="member_updated")return `actualizó el acceso de ${item.details}`;if(item.action==="numbers_updated")return "actualizó los números de juego";return `actualizó la casilla ${item.squareId}`; }
function formatDate(value:string){ try{return new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return value;} }
